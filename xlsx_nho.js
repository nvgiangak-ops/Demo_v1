/* =====================================================================
   XLSX NHỎ: tạo file Excel (.xlsx) ngay trên trình duyệt, không cần Internet hay thư viện ngoài.
   Dùng cho bảng kê đi chợ (phieu.html) và bảng tổng hợp chi phí (tab Lịch sử).

   XLSX_NHO.tao([{ten: "Kê chợ", cot: [6, 30, 12], dong: [[ô, ô, ...], ...], gop: ["A1:H1"], ngang: false}])
     -> Blob. Mỗi ô là chữ, số, null (ô trống) hoặc {v: giá trị, s: "kiểu", f: "công thức"}.
     Kiểu: tieu_de, ghi_chu, dau (tiêu đề cột), chu, chu_dam, so (#.##0), so_dam, so_le (số lẻ tự do).
   XLSX_NHO.tai(blob, "ten-file.xlsx") -> tải file về máy.
   File là gói zip "lưu nguyên" (không nén) các tệp XML theo chuẩn Office Open XML.
   ===================================================================== */
(function (goc) {
"use strict";

const KIEU = {"": 0, dau: 1, so: 2, so_dam: 3, chu: 4, tieu_de: 5, ghi_chu: 6, so_le: 7, chu_dam: 8};

/* ---------- zip không nén ---------- */
const BANG_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = BANG_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function dongGoiZip(tep) {
  const ma = new TextEncoder(), phan = [], trungTam = [];
  const d = new Date();
  const gio = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const ngay = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let viTri = 0;
  for (const f of tep) {
    const ten = ma.encode(f.ten), dl = ma.encode(f.noi_dung), crc = crc32(dl);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, gio, true); h.setUint16(12, ngay, true); h.setUint32(14, crc, true);
    h.setUint32(18, dl.length, true); h.setUint32(22, dl.length, true); h.setUint16(26, ten.length, true); h.setUint16(28, 0, true);
    phan.push(new Uint8Array(h.buffer), ten, dl);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, gio, true); c.setUint16(14, ngay, true); c.setUint32(16, crc, true);
    c.setUint32(20, dl.length, true); c.setUint32(24, dl.length, true); c.setUint16(28, ten.length, true);
    c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
    c.setUint32(38, 0, true); c.setUint32(42, viTri, true);
    trungTam.push(new Uint8Array(c.buffer), ten);
    viTri += 30 + ten.length + dl.length;
  }
  const coTT = trungTam.reduce((a, x) => a + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(4, 0, true); e.setUint16(6, 0, true);
  e.setUint16(8, tep.length, true); e.setUint16(10, tep.length, true);
  e.setUint32(12, coTT, true); e.setUint32(16, viTri, true); e.setUint16(20, 0, true);
  return new Blob(phan.concat(trungTam, [new Uint8Array(e.buffer)]),
                  {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}

/* ---------- XML ---------- */
const xml = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
function tenCot(i) {                    /* 0 -> A, 25 -> Z, 26 -> AA */
  let s = "";
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
function tenTrang(t, i) {
  const s = String(t || "Trang " + (i + 1)).replace(/[\[\]:*?\/\\]/g, " ").trim().slice(0, 31);
  return s || "Trang " + (i + 1);
}
function oXml(o, r, c) {
  if (o === null || o === undefined || o === "") return "";
  const ref = tenCot(c) + r;
  if (typeof o !== "object") o = {v: o};
  const s = KIEU[o.s || ""] || 0, st = s ? ' s="' + s + '"' : "";
  if (o.f) {
    const v = typeof o.v === "number" && isFinite(o.v) ? "<v>" + o.v + "</v>" : "";
    return '<c r="' + ref + '"' + st + "><f>" + xml(o.f) + "</f>" + v + "</c>";
  }
  if (typeof o.v === "number" && isFinite(o.v)) return '<c r="' + ref + '"' + st + "><v>" + o.v + "</v></c>";
  if (o.v === null || o.v === undefined || o.v === "") return st ? '<c r="' + ref + '"' + st + "/>" : "";
  return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + xml(o.v) + "</t></is></c>";
}
function trangXml(t) {
  const cot = (t.cot || []).map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("");
  const dong = (t.dong || []).map((h, i) => {
    const r = i + 1, o = (h || []).map((x, c) => oXml(x, r, c)).join("");
    return '<row r="' + r + '">' + o + "</row>";
  }).join("");
  const gop = (t.gop || []).length ? '<mergeCells count="' + t.gop.length + '">' + t.gop.map(g => '<mergeCell ref="' + g + '"/>').join("") + "</mergeCells>" : "";
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    (cot ? "<cols>" + cot + "</cols>" : "") + "<sheetData>" + dong + "</sheetData>" + gop +
    '<pageMargins left="0.45" right="0.45" top="0.55" bottom="0.55" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="' + (t.ngang ? "landscape" : "portrait") + '" fitToWidth="1" fitToHeight="0"/>' +
    "</worksheet>";
}
const VIEN = '<left style="thin"><color rgb="FFB7C4B4"/></left><right style="thin"><color rgb="FFB7C4B4"/></right>' +
             '<top style="thin"><color rgb="FFB7C4B4"/></top><bottom style="thin"><color rgb="FFB7C4B4"/></bottom><diagonal/>';
const KIEU_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="4"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font>' +
  '<font><b/><sz val="14"/><name val="Arial"/></font><font><i/><sz val="10"/><color rgb="FF56655B"/><name val="Arial"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE3EFE2"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>' + VIEN + '</border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="9">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
  '<xf numFmtId="3" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function tao(dsTrang) {
  const n = dsTrang.length, tep = [];
  tep.push({ten: "[Content_Types].xml", noi_dung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    dsTrang.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'});
  tep.push({ten: "_rels/.rels", noi_dung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'});
  tep.push({ten: "xl/workbook.xml", noi_dung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    dsTrang.map((t, i) => '<sheet name="' + xml(tenTrang(t.ten, i)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") +
    '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'});
  tep.push({ten: "xl/_rels/workbook.xml.rels", noi_dung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    dsTrang.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("") +
    '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'});
  tep.push({ten: "xl/styles.xml", noi_dung: KIEU_XML});
  dsTrang.forEach((t, i) => tep.push({ten: "xl/worksheets/sheet" + (i + 1) + ".xml", noi_dung: trangXml(t)}));
  return dongGoiZip(tep);
}
function tai(blob, ten) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = ten;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 20000);
}

goc.XLSX_NHO = {tao: tao, tai: tai, tenCot: tenCot};
})(typeof window !== "undefined" ? window : globalThis);
