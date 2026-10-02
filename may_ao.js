/* =====================================================================
   MÁY ẢO – BẢN TRÌNH DIỄN CHẠY HOÀN TOÀN TRÊN TRÌNH DUYỆT (dùng cho GitHub Pages)

   Webapp index.html vẫn giữ nguyên. File này "đóng vai" UniHiker M10:
   mọi lệnh gọi /api/... và luồng sự kiện /api/su-kien được trả lời ngay trong trình duyệt.
   Thuật toán được chuyển nguyên từ chon_mon.py, dinh_duong.py và bo_dieu_phoi.py,
   nên vòng quay, cách ghép mâm và điểm cân đối giống hệt máy thật.

   Dữ liệu lưu trên chính thiết bị đang mở trang (localStorage), ảnh món lưu trong IndexedDB.
   Mỗi người mở trang có dữ liệu riêng, không ảnh hưởng tới nhau.

   Lưu ý khi sửa code: đổi thuật toán trong file .py nào thì sửa phần tương ứng ở đây.
   File này không được dùng khi chạy trên M10 (máy chủ Flask không phục vụ nó).
   ===================================================================== */
(function (goc) {
"use strict";

/* ================================================================ cấu hình (như cau_hinh.py) */
const CH = {
  SO_O: 12, THOI_GIAN_QUAY: 6.0, SO_VONG_QUAY: 5,
  DO_TRE_DONG_BO: 0.15,          /* trên trình duyệt không có mạng ở giữa nên hẹn rất ngắn */
  SO_NGAY_LICH_SU_TOI_DA: 400, MUI_GIO_PHUT: 420
};
const CAI_DAT_MAC_DINH = {
  ho_so: "thcs_thpt", bua: "trua", nang_luong_tuy_chinh: 0, cua_so_chong_lap: 14, so_lan_quay_lai: 2,
  di_ung: [], mui_gio_phut: CH.MUI_GIO_PHUT, mui_gio_ten: "Asia/Ho_Chi_Minh",
  so_nguoi_di_cho: 30,           /* số suất ăn mỗi bữa */
  dinh_muc_suat: 30000, chi_phi_khac_suat: 0,    /* định mức tiền ăn một suất; chi phí khác cộng vào mỗi suất (đồng) */
  uu_tien_chi_phi: 1,            /* 0: dinh dưỡng trước · 1: cân bằng · 2: ưu tiên tiết kiệm */
  ma_quan_tri: "", do_sang_led: 110, tu_chinh_do_sang: true, coi: true, lac_de_quay: true,
  kieu_vong: "mat_so",           /* mat_so: mặt số 1–12 đứng yên, kim và đèn chạy · banh_xe: bánh xe quay */
  don_vi: "", nguoi_thuc_hien: "", gvhd: "",     /* tên đơn vị, người thực hiện, giáo viên hướng dẫn */
  giong_doc: "tat_ca", am_luong_giong: 100,      /* đọc tên món: tat_ca | chot | tat */
  mo_dau: true,                                  /* chào mở đầu khi khởi động: nhạc hiệu, lời chào, vòng LED cầu vồng */
  ai_bat: true                                   /* khung chat Hỏi Bin (bản trình diễn gọi Gemini trực tiếp bằng khóa lưu trên thiết bị) */
};

/* giọng mẫu đi kèm (tên, vùng giọng); chạy trong Node để kiểm thử thì chưa có GIONG_AO */
function thongTinGiongMau() { try { return GIONG_AO.thongTinMau(); } catch (e) { return {ten: "", vung: ""}; } }

/* ================================================================ tiện ích cho giống Python */
/* round() của Python: tính trên giá trị nhị phân chính xác của số và làm tròn "nửa về số chẵn",
   ví dụ round(8.5) = 8, round(5.25, 1) = 5.2, round(3.15, 1) = 3.1 (vì 3.15 thật ra là 3.1499999...) */
const DV = new DataView(new ArrayBuffer(8));
function lamTron(x, n) {
  n = n || 0;
  if (!isFinite(x) || x === 0) return x;
  DV.setFloat64(0, x);
  const hi = DV.getUint32(0), lo = DV.getUint32(4), mu = (hi >>> 20) & 0x7ff;
  let M = (BigInt(hi & 0xfffff) << BigInt(32)) | BigInt(lo), E;
  if (mu === 0) E = -1074; else { M |= BigInt(1) << BigInt(52); E = mu - 1075; }
  let tu = E >= 0 ? M << BigInt(E) : M, mau = E >= 0 ? BigInt(1) : BigInt(1) << BigInt(-E);
  tu *= BigInt(10) ** BigInt(n);
  let q = tu / mau;
  const du2 = (tu % mau) * BigInt(2);
  if (du2 > mau || (du2 === mau && (q & BigInt(1)) === BigInt(1))) q += BigInt(1);
  const kq = Number(q) / Math.pow(10, n);
  return (hi >>> 31) ? -kq : kq;
}
const nguyen = x => Math.trunc(Number(x));                 /* int() */
const saoChep = x => JSON.parse(JSON.stringify(x));
const modDuong = (a, b) => ((a % b) + b) % b;              /* phép % của Python với b > 0 */
const coKhoa = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const hexMau = rgb => "#" + rgb.map(c => Math.trunc(c).toString(16).padStart(2, "0")).join("");
const cat = (s, n) => Array.from(String(s)).slice(0, n).join("");     /* s[:n] theo ký tự */
const THONG_TIN = [["don_vi", 100], ["nguoi_thuc_hien", 160], ["gvhd", 100]];   /* ô nhập tay trong Cài đặt, độ dài tối đa */
const gonChu = (x, dai) => (typeof x === "string" || typeof x === "number")          /* giống gon_chu trong bo_dieu_phoi.py */
  ? cat(String(x).split(/\s+/).filter(Boolean).join(" "), dai) : "";
const cungNoiDung = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function taoRng(ham) {                  /* giống random.Random: uniform, choice, shuffle */
  const r = ham || Math.random;
  return {
    random: r,
    uniform: (a, b) => a + (b - a) * r(),
    choice: ds => ds[Math.floor(r() * ds.length)],
    shuffle: ds => {
      for (let i = ds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = ds[i]; ds[i] = ds[j]; ds[j] = t; }
    }
  };
}

class LoiNghiepVu extends Error {}
class CanMaQuanTri extends Error {}

/* ---------- ngày giờ (dùng giờ địa phương của thiết bị) ---------- */
const p2 = n => String(n).padStart(2, "0");
function isoTuSo(so) { return new Date(so * 864e5).toISOString().slice(0, 10); }
function soTuIso(s) {                   /* "YYYY-MM-DD" -> số ngày kể từ 1970; null nếu sai */
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const p = s.split("-").map(Number), so = Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5);
  return isoTuSo(so) === s ? so : null;
}
function thoiDiem(d) {
  const so = Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  return {nam: d.getFullYear(), thang: d.getMonth() + 1, ngay: d.getDate(), gio: d.getHours(), phut: d.getMinutes(),
          giay: d.getSeconds(), thu: (d.getDay() + 6) % 7, so: so, iso: isoTuSo(so)};
}
function ngayCong(hn, soNgay) { const so = hn.so + soNgay, iso = isoTuSo(so); return {so: so, iso: iso, thang: Number(iso.slice(5, 7))}; }

/* ================================================================ DINH DƯỠNG (dinh_duong.py) */
const CHAT = ["kcal", "dam", "beo", "bot", "xo", "ca", "sat", "vit_a", "vit_c", "natri", "duong"];
const I = {}; CHAT.forEach((k, i) => { I[k] = i; });
const I_RAU = CHAT.length, I_TIEN = CHAT.length + 1, DAI_VEC = CHAT.length + 2;   /* rau (g), tiền mua (đồng) */
const NA_MOI_G_MUOI = 393, GAO_MOI_CHEN = 55;

const HO_SO = {
  tieu_hoc_6_7:   {ten: "Tiểu học, 6–7 tuổi", kcal_ngay: 1515, khoang: "1.460–1.570", rau_ngay: [80, 120], muoi_ngay: 4, duong_ngay: 15, he_so: 0.6,
                   vi_chat: {ca: 650, sat: 9, vit_a: 450, vit_c: 45}},
  tieu_hoc_8_9:   {ten: "Tiểu học, 8–9 tuổi", kcal_ngay: 1775, khoang: "1.730–1.820", rau_ngay: [80, 120], muoi_ngay: 4, duong_ngay: 15, he_so: 0.7,
                   vi_chat: {ca: 700, sat: 9, vit_a: 450, vit_c: 45}},
  tieu_hoc_10_11: {ten: "Tiểu học, 10–11 tuổi", kcal_ngay: 2065, khoang: "1.980–2.150", rau_ngay: [80, 120], muoi_ngay: 4, duong_ngay: 15, he_so: 0.85,
                   vi_chat: {ca: 1000, sat: 11, vit_a: 500, vit_c: 65}},
  thcs_thpt:      {ten: "THCS – THPT, 12–18 tuổi", kcal_ngay: 2565, khoang: "2.310–2.820", rau_ngay: [100, 150], muoi_ngay: 5, duong_ngay: 25, he_so: 1.0,
                   vi_chat: {ca: 1000, sat: 14, vit_a: 650, vit_c: 80}}
};
const TEN_VI_CHAT = {ca: ["Canxi", "mg"], sat: ["Sắt", "mg"], vit_a: ["Vitamin A", "µg"], vit_c: ["Vitamin C", "mg"]};
const BUA = {
  trua: {ten: "Bữa trưa", ty_le: 0.35, khoang: "30–40%"},
  toi:  {ten: "Bữa tối", ty_le: 0.275, khoang: "25–30%"}
};
const NHOM_DAM = {
  ca:      {ten: "Cá", mau: [79, 163, 214]},
  hai_san: {ten: "Tôm, mực, cua", mau: [232, 110, 140]},
  heo:     {ten: "Thịt heo", mau: [226, 120, 100]},
  ga:      {ten: "Thịt gà", mau: [240, 168, 60]},
  bo:      {ten: "Thịt bò", mau: [170, 110, 80]},
  trung:   {ten: "Trứng", mau: [238, 200, 60]},
  dau:     {ten: "Đậu, đậu hũ", mau: [110, 180, 90]}
};
const MAU_MAC_DINH = [150, 150, 150];
const NHOM_RAU = ["rau"];
const MEO_DINH_DUONG = [
  "Mỗi bữa chính nên có đủ 4 nhóm: tinh bột, chất đạm, chất béo, rau củ và trái cây.",
  "Học sinh nên ăn cá hoặc thủy hải sản ít nhất 2–3 lần mỗi tuần.",
  "Đậu hũ, đậu xanh, đậu đen là nguồn đạm thực vật tốt, nên có ít nhất 2 lần mỗi tuần.",
  "Rau lá xanh đậm như rau ngót, rau đay, cải xanh giàu canxi, sắt và vitamin.",
  "Tuổi dậy thì xương lớn nhanh: tôm tép, cua đồng, cá nhỏ ăn cả xương và sữa là nguồn canxi quý.",
  "Thịt bò, trứng giàu sắt; ăn kèm rau quả giàu vitamin C giúp cơ thể hấp thu sắt tốt hơn.",
  "Nêm nhạt tay: học sinh THCS–THPT nên ăn dưới 5 g muối mỗi ngày, học sinh tiểu học dưới 4 g.",
  "Nước lọc là thức uống tốt nhất; hạn chế nước ngọt có ga và trà sữa nhiều đường.",
  "Đồ chiên rán, xúc xích, lạp xưởng chỉ nên ăn thỉnh thoảng, không phải mỗi ngày.",
  "Bữa sáng nên cung cấp khoảng 1/4 năng lượng cả ngày, giúp tập trung học tốt hơn.",
  "Ăn chậm, nhai kỹ và dừng lại khi thấy no vừa đủ.",
  "Ăn trái cây nguyên quả thay vì uống nước ép để giữ được chất xơ.",
  "Học sinh THCS–THPT cần khoảng 1,6–2,4 lít nước mỗi ngày, uống thêm khi trời nóng hoặc chơi thể thao.",
  "Rửa tay bằng xà phòng trước khi ăn và sau khi đi vệ sinh.",
  "Thực phẩm theo mùa vừa tươi ngon, vừa rẻ, lại ít phải bảo quản.",
  "Luộc, hấp, kho, nấu canh giữ nhiều dưỡng chất và ít dầu mỡ hơn chiên rán.",
  "Nên dùng dầu thực vật như dầu đậu nành, dầu phộng, dầu mè khi xào nấu hằng ngày.",
  "Có thể trộn thêm gạo lứt, khoai lang hoặc bắp vào cơm để tăng chất xơ.",
  "Mùa nước nổi miền Tây có cá linh, bông điên điển, bông súng — món ngon theo mùa.",
  "Một mâm cơm nhiều màu sắc (xanh, đỏ, vàng, cam) thường đa dạng vitamin hơn.",
  "Ngủ đủ giấc và vận động ít nhất 60 phút mỗi ngày giúp cơ thể phát triển tốt.",
  "Cơ thể đang lớn cần đủ năng lượng: đừng bỏ bữa, nhất là bữa sáng.",
  "Nên có sữa hoặc sữa chua trong ngày để bổ sung canxi.",
  "Thức ăn chín cần bảo quản trong tủ lạnh và hâm nóng kỹ trước khi ăn lại."
];

function vecRong() { return new Array(DAI_VEC).fill(0); }
function vecCong(a, b, k) { if (k == null) k = 1; return a.map((x, i) => x + b[i] * k); }
/* số gam phải mua để có g gam phần ăn được; tiền mua (giá lưu theo đơn vị mua: gia đồng cho g_dv gam) */
function gamMua(nl, g) { const tb = Number(nl.thai_bo || 0); return g / Math.max(0.05, 1 - tb / 100); }
function tienNguyenLieu(nl, g) {
  const gia = Number(nl.gia || 0), gDv = Number(nl.g_dv || 1000);
  if (gia <= 0 || gDv <= 0) return 0;
  return gamMua(nl, g) * (gia / gDv);
}
function vecNguyenLieu(nl, g) {
  const v = vecRong(), k = g / 100;
  CHAT.forEach(c => { v[I[c]] = Number(nl[c] || 0) * k; });
  if (NHOM_RAU.includes(nl.nhom)) v[I_RAU] = g;
  v[I_TIEN] = tienNguyenLieu(nl, g);
  return v;
}
function vecMon(mon, khoNl, chiDc) {
  let v = vecRong();
  (mon.nguyen_lieu || []).forEach(r => {
    if (chiDc != null && !!r.dc !== chiDc) return;
    const nl = khoNl.get(r.id);
    if (nl) v = vecCong(v, vecNguyenLieu(nl, Number(r.g || 0)));
  });
  return v;
}
function tomTatVec(v) {
  const kq = {};
  CHAT.forEach(c => { kq[c] = lamTron(v[I[c]], 1); });
  kq.kcal = lamTron(v[I.kcal]);
  kq.rau_g = lamTron(v[I_RAU]);
  kq.tien = lamTron(v[I_TIEN]);
  return kq;
}
function tyLeNangLuong(v) {
  const e = v[I.dam] * 4 + v[I.beo] * 9 + v[I.bot] * 4;
  if (e <= 0) return [0, 0, 0];
  return [v[I.dam] * 400 / e, v[I.beo] * 900 / e, v[I.bot] * 400 / e];
}
function mucTieu(cd) {
  const hs = HO_SO[cd.ho_so] || HO_SO.thcs_thpt, bua = BUA[cd.bua] || BUA.trua;
  const kcalNgay = nguyen(cd.nang_luong_tuy_chinh || 0) || hs.kcal_ngay, tl = bua.ty_le;
  const vc = {};
  Object.keys(hs.vi_chat).forEach(k => { vc[k] = lamTron(hs.vi_chat[k] * tl, 1); });
  return {
    ho_so: cd.ho_so || "thcs_thpt", ten_ho_so: hs.ten, ten_bua: bua.ten, khoang_bua: bua.khoang,
    kcal_ngay: kcalNgay, kcal: lamTron(kcalNgay * tl), kcal_min: lamTron(kcalNgay * tl * 0.9), kcal_max: lamTron(kcalNgay * tl * 1.1),
    rau_min: lamTron(hs.rau_ngay[0] / 2), natri_max: lamTron(hs.muoi_ngay * NA_MOI_G_MUOI * tl), muoi_ngay: hs.muoi_ngay,
    duong_max: lamTron(hs.duong_ngay * tl, 1), he_so: hs.he_so, dam: [13, 20], beo: [20, 30], bot: [55, 65], vi_chat: vc,
    dinh_muc: nguyen(cd.dinh_muc_suat || 0), chi_phi_khac: nguyen(cd.chi_phi_khac_suat || 0),
    uu_tien_chi_phi: cd.uu_tien_chi_phi == null ? 1 : nguyen(cd.uu_tien_chi_phi)
  };
}
/* ---------- chi phí (dinh_duong.py) ---------- */
const HE_SO_UU_TIEN = {0: 0.0, 1: 1.0, 2: 2.5};
const UU_TIEN_CHI_PHI = {0: "Dinh dưỡng trước, chi phí chỉ để theo dõi", 1: "Cân bằng dinh dưỡng và chi phí",
                         2: "Ưu tiên tiết kiệm, vẫn giữ mâm cân đối"};
function _tyLeDinhMuc(tien, mt) {
  const dm = mt.dinh_muc || 0, k = coKhoa(HE_SO_UU_TIEN, mt.uu_tien_chi_phi == null ? 1 : mt.uu_tien_chi_phi)
    ? HE_SO_UU_TIEN[mt.uu_tien_chi_phi == null ? 1 : mt.uu_tien_chi_phi] : 1.0;
  if (dm <= 0 || k <= 0) return [null, 0];
  return [(tien + (mt.chi_phi_khac || 0)) / dm, k];
}
function phatChiPhi(tien, mt) {
  const t = _tyLeDinhMuc(tien, mt), r = t[0], k = t[1];
  if (r == null) return 0;
  return k * (12.0 * r + 60.0 * Math.min(0.1, Math.max(0, r - 1)));
}
function heSoChiPhi(tien, mt) {
  const t = _tyLeDinhMuc(tien, mt), r = t[0], k = t[1];
  if (r == null) return 1.0;
  if (r <= 1) return 1.0 + 0.12 * k * (1.0 - r);
  return 1.0 / (1.0 + 3.0 * k * (r - 1.0));
}
function _diemKhoang(x, lo, hi, diem, thap0, cao0) {
  if (lo <= x && x <= hi) return diem;
  if (x < lo) return diem * Math.max(0, (x - thap0) / (lo - thap0));
  return diem * Math.max(0, (cao0 - x) / (cao0 - hi));
}
/* Điểm 0–100: năng lượng 20 · đạm 15 · béo 12 · bột đường 8 · rau 15 · muối 12 · vi chất 18 */
function chamDiemNhanh(v, mt) {
  const kcal = v[0];
  if (kcal <= 0) return 0;
  const tl = tyLeNangLuong(v), pe = tl[0], be = tl[1], bo = tl[2];
  const r = kcal / mt.kcal;
  let d = _diemKhoang(r, 0.9, 1.1, 20, 0.3, 1.5);
  d += _diemKhoang(pe, 13, 20, 15, 8, 28);
  if (20 <= be && be <= 30) d += 12;
  else if (15 <= be && be < 20) d += 8 + 0.8 * (be - 15);
  else if (be < 15) d += 8 * Math.max(0, (be - 5) / 10);
  else d += 12 * Math.max(0, (40 - be) / 10);
  d += _diemKhoang(bo, 55, 65, 8, 45, 78);
  d += 15 * Math.min(1, v[I_RAU] / Math.max(1, mt.rau_min));
  const na = v[I.natri], L = mt.natri_max;
  d += na <= L ? 12 : 12 * Math.max(0, (1.8 * L - na) / (0.8 * L));
  const vc = mt.vi_chat;
  d += 8 * Math.min(1, v[I.ca] / vc.ca);
  d += 5 * Math.min(1, v[I.sat] / vc.sat);
  d += 2.5 * Math.min(1, v[I.vit_a] / vc.vit_a) + 2.5 * Math.min(1, v[I.vit_c] / vc.vit_c);
  return d;
}
function viChatChiTiet(v, mt) {
  return ["ca", "sat", "vit_a", "vit_c"].map(k => {
    const ten = TEN_VI_CHAT[k], can = mt.vi_chat[k], co = v[I[k]];
    return {id: k, ten: ten[0], don_vi: ten[1], gia_tri: lamTron(co, 1), muc_tieu: can, phan_tram: can ? lamTron(100 * co / can) : 0};
  });
}
function xepLoai(diem) { return diem >= 90 ? "Rất cân đối" : diem >= 75 ? "Cân đối" : diem >= 60 ? "Tạm ổn" : "Cần bổ sung"; }
function danhGiaChiTiet(v, mt) {
  const tl = tyLeNangLuong(v), pe = tl[0], be = tl[1], bo = tl[2], kcal = v[0], ds = [];
  const them = (ten, giaTri, muc, dat, gan) => ds.push({ten: ten, gia_tri: giaTri, muc_tieu: muc, trang_thai: dat ? "dat" : (gan ? "gan" : "chua")});
  const r = mt.kcal ? kcal / mt.kcal : 0;
  them("Năng lượng", lamTron(kcal) + " kcal", mt.kcal_min + "–" + mt.kcal_max + " kcal", 0.9 <= r && r <= 1.1, 0.8 <= r && r <= 1.2);
  them("Chất đạm", lamTron(pe) + "%", "13–20%", 13 <= pe && pe <= 20, 10 <= pe && pe <= 24);
  them("Chất béo", lamTron(be) + "%", "20–30%", 20 <= be && be <= 30, 15 <= be && be <= 34);
  them("Bột đường", lamTron(bo) + "%", "55–65%", 55 <= bo && bo <= 65, 50 <= bo && bo <= 70);
  them("Rau xanh", lamTron(v[I_RAU]) + " g", "≥ " + mt.rau_min + " g", v[I_RAU] >= mt.rau_min, v[I_RAU] >= mt.rau_min * 0.6);
  const na = v[I.natri];
  them("Muối (natri)", lamTron(na) + " mg", "≤ " + mt.natri_max + " mg", na <= mt.natri_max, na <= mt.natri_max * 1.4);
  return [ds, tl];
}
function goiYBoSung(v, mt, tl, daToiDaCom) {
  const pe = tl[0], be = tl[1], gy = [];
  if (be < 18) gy.push("Bữa này hơi ít chất béo: có thể xào rau thay vì luộc, hoặc thêm chút mỡ hành, mè rang.");
  else if (be > 32) gy.push("Bữa này khá nhiều dầu mỡ: bữa sau nên chọn món luộc, hấp hoặc canh.");
  if (pe < 13) gy.push("Đạm còn thấp: thêm 1 quả trứng, vài miếng đậu hũ hoặc 1 hộp sữa chua.");
  if (v[I_RAU] < mt.rau_min)
    gy.push("Chưa đủ rau: thêm một đĩa rau luộc hoặc rau sống khoảng " + Math.max(30, Math.floor(nguyen(mt.rau_min - v[I_RAU] + 9) / 10) * 10) + " g.");
  if (v[I.natri] > mt.natri_max * 1.15) gy.push("Hơi mặn so với khuyến nghị: giảm bớt nước mắm khi nêm và pha nước chấm loãng hơn.");
  if (v[I.duong] > mt.duong_max) gy.push("Lượng đường thêm vào hơi cao: kho, rim bớt ngọt một chút.");
  if (v[0] < mt.kcal_min && daToiDaCom) gy.push("Năng lượng còn thiếu: có thể thêm bữa phụ chiều như sữa, bắp luộc hoặc khoai lang.");
  const vc = mt.vi_chat;
  if (v[I.ca] < vc.ca * 0.5) gy.push("Canxi còn thấp: bữa khác nên có tôm tép, cá nhỏ ăn cả xương, rau ngót, đậu hũ hoặc sữa.");
  if (v[I.sat] < vc.sat * 0.5) gy.push("Sắt còn thấp: thịt bò, trứng, rau đay, rau ngót là các nguồn sắt dễ tìm.");
  if (v[I.vit_c] < vc.vit_c * 0.6) gy.push("Ít vitamin C: tráng miệng bằng ổi, cam hoặc đu đủ sẽ tốt hơn.");
  return gy;
}

const HE_SO_MON = [0.9, 1.0, 1.15, 1.3];
const HE_SO_DC = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
function _dsGao(mt, buoc) {
  buoc = buoc || 5;
  const gmax = lamTron(160 * mt.he_so / 5) * 5, gmin = Math.max(30, lamTron(50 * mt.he_so / 5) * 5), ds = [];
  for (let g = gmin; g <= gmax; g += buoc) ds.push(g);
  return ds;
}
const mauNhom = nhom => (NHOM_DAM[nhom] || {}).mau || MAU_MAC_DINH;

/* Tính và tối ưu khẩu phần một mâm: món chính + canh + cơm + tráng miệng */
class BoTinhMam {
  constructor(khoNl, khoMon, mt) {
    this.nl = khoNl; this.mon = khoMon; this.mt = mt; this._cache = new Map();
    this.uoc = new Map();                /* monId -> [điểm ước lượng, tiền một suất] */
    this.vecGao = vecNguyenLieu(khoNl.get("gao_te") || {kcal: 344, dam: 7.9, beo: 1, bot: 75.9, natri: 5}, 1.0);
  }
  vec(monId, chiDc) {
    const k = monId + "|" + chiDc;
    if (!this._cache.has(k)) { const m = this.mon.get(monId); this._cache.set(k, m ? vecMon(m, this.nl, chiDc) : vecRong()); }
    return this._cache.get(k);
  }
  _toiUuLuong(monId, canhId, tmId, buocGao) {
    const mt = this.mt, hs = mt.he_so, mon = this.mon.get(monId);
    let nen = vecRong();
    if (canhId) nen = vecCong(nen, this.vec(canhId), hs);
    if (tmId) nen = vecCong(nen, this.vec(tmId), Math.max(0.7, hs));
    let tot = [-1, null];
    if (mon.loai === "mot_to") {
      const coDinh = this.vec(monId, false), dc = this.vec(monId, true);
      for (const s of HE_SO_MON) {
        const v1 = vecCong(nen, coDinh, s * hs);
        for (const t of HE_SO_DC) {
          const v = vecCong(v1, dc, t * hs);
          const d = chamDiemNhanh(v, mt) - 0.8 * Math.abs(s - 1) - 0.5 * Math.abs(t - 1);
          if (d > tot[0]) tot = [d, [s * hs, t * hs, v]];
        }
      }
    } else {
      const vm = this.vec(monId), dsGao = _dsGao(mt, buocGao || 5);
      for (const s of HE_SO_MON) {
        const v1 = vecCong(nen, vm, s * hs);
        for (const g of dsGao) {
          const v = vecCong(v1, this.vecGao, g);
          const d = chamDiemNhanh(v, mt) - 0.8 * Math.abs(s - 1);
          if (d > tot[0]) tot = [d, [s * hs, g, v]];
        }
      }
    }
    return tot;
  }
  uocTinh(monId, dsCanh, tmMacDinh) {
    const mon = this.mon.get(monId);
    let kq;
    if (!mon) kq = [0, 0];
    else if (mon.loai === "mot_to") { const t = this._toiUuLuong(monId, null, tmMacDinh, 10); kq = [t[0], t[1][2][I_TIEN]]; }
    else {
      let uuTien = (mon.goi_y_canh || []).filter(c => dsCanh.includes(c));
      if (!uuTien.length) uuTien = dsCanh;
      if (!uuTien.length) kq = [0, this._toiUuLuong(monId, null, tmMacDinh, 10)[1][2][I_TIEN]];
      else {
        let tot = 0; kq = null;
        for (const c of uuTien) {
          const t = this._toiUuLuong(monId, c, tmMacDinh, 10), v = t[1][2];
          const gt = t[0] - phatChiPhi(v[I_TIEN], this.mt);
          if (kq === null || gt > tot) { kq = [t[0], v[I_TIEN]]; tot = gt; }
        }
      }
    }
    this.uoc.set(monId, kq);
    return kq;
  }
  diemUocTinh(monId, dsCanh, tmMacDinh) { return Math.max(0, this.uocTinh(monId, dsCanh, tmMacDinh)[0]); }
  taoMam(monId, dsCanh, dsTm, rng, coDinhCanh, coDinhTm, boQua) {
    boQua = boQua || {};
    const mt = this.mt, mon = this.mon.get(monId), laMotTo = mon.loai === "mot_to";
    const sapXep = (a, b) => (b[0] - a[0]) || (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0);   /* sort(reverse=True) */
    let canhId = null;
    if (!laMotTo) {
      if (coDinhCanh) canhId = coDinhCanh;
      else if (dsCanh.length) {
        let ung = dsCanh.filter(c => !(boQua.canh || []).includes(c));
        if (!ung.length) ung = dsCanh;
        const tmTam = dsTm.length ? dsTm[0] : null, xep = [];
        for (const c of ung) {
          const t = this._toiUuLuong(monId, c, tmTam, 10);
          let d = t[0];
          d -= phatChiPhi(t[1][2][I_TIEN], mt);
          if ((mon.goi_y_canh || []).includes(c)) d += 4;
          xep.push([d + rng.uniform(0, 3), c]);
        }
        xep.sort(sapXep);
        canhId = xep[0][1];
      }
    }
    let tmId = null;
    if (coDinhTm) tmId = coDinhTm;
    else if (dsTm.length) {
      let ung = dsTm.filter(t => !(boQua.trang_mieng || []).includes(t));
      if (!ung.length) ung = dsTm;
      const xep = [];
      for (const t of ung) {
        const r = this._toiUuLuong(monId, canhId, t, 10);
        xep.push([r[0] - phatChiPhi(r[1][2][I_TIEN], mt) + rng.uniform(0, 4), t]);
      }
      xep.sort(sapXep);
      tmId = xep[0][1];
    }
    const kq = this._toiUuLuong(monId, canhId, tmId, 5)[1];
    const mam = this.dongGoi(monId, canhId, tmId, kq[0], kq[1], kq[2]);
    mam.tiet_kiem = this.phuongAnTietKiem(monId, canhId, tmId, dsCanh, dsTm, kq[2], mam.diem, boQua);
    return mam;
  }
  /* Đổi một món kèm sang món rẻ hơn mà điểm cân đối giảm không quá 5 (tối đa 2 cách mỗi loại) */
  phuongAnTietKiem(monId, canhId, tmId, dsCanh, dsTm, v0, diem0, boQua) {
    boQua = boQua || {};
    const tien0 = v0[I_TIEN], kq = [];
    for (const [loai, ds, hien] of [["canh", dsCanh, canhId], ["trang_mieng", dsTm, tmId]]) {
      if (!hien) continue;
      const ung = [];
      for (const x of ds) {
        if (x === hien || (boQua[loai] || []).includes(x)) continue;
        const c = loai === "canh" ? x : canhId, t = loai === "canh" ? tmId : x;
        const v = this._toiUuLuong(monId, c, t, 5)[1][2];
        const diem = lamTron(chamDiemNhanh(v, this.mt)), tiet = tien0 - v[I_TIEN];
        if (tiet >= Math.max(500.0, 0.03 * tien0) && diem >= diem0 - 5) ung.push([-tiet, -diem, x, v[I_TIEN], diem]);
      }
      ung.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
      for (const u of ung.slice(0, 2))
        kq.push({loai: loai, id: u[2], ten: this.mon.get(u[2]).ten, diem: u[4], tien: lamTron(u[3]), tiet_kiem: lamTron(tien0 - u[3])});
    }
    return kq;
  }
  dongGoi(monId, canhId, tmId, s, x, v) {
    const mt = this.mt, mon = this.mon.get(monId), laMotTo = mon.loai === "mot_to", hs = mt.he_so;
    const chiTiet = [];
    const themNl = (nguon, monX, heSoNg, heSoDc) => {
      (monX.nguyen_lieu || []).forEach(r => {
        const g = Number(r.g || 0) * ((heSoDc != null && r.dc) ? heSoDc : heSoNg);
        if (g <= 0) return;
        chiTiet.push({nguon: nguon, id: r.id, g: g});
      });
    };
    let tinhBot = null;
    if (laMotTo) {
      themNl("mon", mon, s, x);
      for (const r of (mon.nguyen_lieu || [])) {
        if (r.dc) {
          const nl = this.nl.get(r.id) || {};
          tinhBot = {loai: "trong_mon", ten: nl.ten || r.id, g: lamTron(Number(r.g) * x / 5) * 5};
          break;
        }
      }
    } else {
      themNl("mon", mon, s);
      chiTiet.push({nguon: "com", id: "gao_te", g: Number(x)});
      tinhBot = {loai: "com", ten: "Cơm trắng", gao_g: nguyen(x), chen: Math.max(0.5, lamTron(x / GAO_MOI_CHEN * 2) / 2)};
    }
    if (canhId) themNl("canh", this.mon.get(canhId), hs);
    if (tmId) themNl("trang_mieng", this.mon.get(tmId), Math.max(0.7, hs));
    /* gộp nguyên liệu theo id */
    const gop = new Map();
    chiTiet.forEach(ct => gop.set(ct.id, (gop.get(ct.id) || 0) + ct.g));
    const dsNl = [], thieuGia = [];
    gop.forEach((g, nid) => {
      const nl = this.nl.get(nid) || {ten: nid, thai_bo: 0, nhom: ""};
      const tb = Number(nl.thai_bo || 0), mua = g / Math.max(0.05, 1 - tb / 100);
      dsNl.push({id: nid, ten: nl.ten || nid, nhom: nl.nhom || "", g: lamTron(g, 1), mua_g: lamTron(mua, 1), thai_bo: tb,
                 tien: lamTron(tienNguyenLieu(nl, g))});
      if (Number(nl.gia || 0) <= 0) thieuGia.push(nl.ten || nid);
    });
    /* tiền từng phần của mâm cho một suất */
    const theoMon = {mon: 0, com: 0, canh: 0, trang_mieng: 0};
    chiTiet.forEach(ct => { const nl = this.nl.get(ct.id); if (nl) theoMon[ct.nguon] += tienNguyenLieu(nl, ct.g); });
    const tien = lamTron(v[I_TIEN]);
    const dg = danhGiaChiTiet(v, mt), tl = dg[1];
    const diem = lamTron(chamDiemNhanh(v, mt));
    const dsGao = _dsGao(mt), gaoMax = !laMotTo && x >= dsGao[dsGao.length - 1];
    return {
      mon: this._theMon(monId, hs ? s / hs : 1),
      canh: canhId ? this._theMon(canhId, 1) : null,
      trang_mieng: tmId ? this._theMon(tmId, 1) : null,
      tinh_bot: tinhBot,
      tong: tomTatVec(v),
      ty_le: {dam: lamTron(tl[0], 1), beo: lamTron(tl[1], 1), bot: lamTron(tl[2], 1)},
      muc_tieu: mt,
      diem: diem,
      xep_loai: xepLoai(diem),
      danh_gia: dg[0],
      vi_chat: viChatChiTiet(v, mt),
      goi_y: goiYBoSung(v, mt, tl, gaoMax),
      nguyen_lieu: dsNl,
      dinh_luong: chiTiet.map(ct => ({nguon: ct.nguon, id: ct.id, g: lamTron(ct.g, 1)})),
      chi_phi: {
        thuc_pham: tien, khac: mt.chi_phi_khac || 0, suat: tien + (mt.chi_phi_khac || 0), dinh_muc: mt.dinh_muc || 0,
        theo_mon: {mon: lamTron(theoMon.mon), com: lamTron(theoMon.com), canh: lamTron(theoMon.canh), trang_mieng: lamTron(theoMon.trang_mieng)},
        thieu_gia: thieuGia
      },
      tiet_kiem: []
    };
  }
  _theMon(monId, heSoSuat) {
    const m = this.mon.get(monId);
    if (!m) return null;
    return {id: m.id, ten: m.ten, ten_ngan: coKhoa(m, "ten_ngan") ? m.ten_ngan : m.ten, loai: m.loai, nhom_dam: m.nhom_dam || "",
            chien: !!m.chien, mo_ta: m.mo_ta || "", cach_lam: m.cach_lam || [], anh_v: m.anh_v || 0, anh_that: !!m.anh_that,
            suat: lamTron(heSoSuat, 2)};
  }
}
function tinhNhanhMon(mon, khoNl) {
  const v = vecMon(mon, khoNl), kq = tomTatVec(v), tl = tyLeNangLuong(v);
  kq.ty_le = {dam: lamTron(tl[0]), beo: lamTron(tl[1]), bot: lamTron(tl[2])};
  return kq;
}

/* ================================================================ CHỌN MÓN (chon_mon.py) */
const NHOM_THUY_SAN = ["ca", "hai_san"];
const NHOM_DONG_VAT = ["ca", "hai_san", "heo", "ga", "bo", "trung"];

function thongKeGanDay(lichSu, khoMon, homNay, soNgay) {
  soNgay = soNgay || 7;
  const tk = {thuy_san: 0, dau: 0, chien: 0, dong_vat: 0, so_bua: 0, diem_tb: 0,
              nhom_hom_qua: null, ngay_gan_nhat: new Map(), canh_gan_day: [], tm_gan_day: []};
  let tongDiem = 0;
  for (const bg of lichSu) {
    const d = soTuIso(bg && bg.ngay);
    if (d == null) continue;
    const cach = homNay.so - d;
    if (cach <= 0) continue;
    const mid = bg.mon;
    if (mid) { const cu = tk.ngay_gan_nhat.get(mid); if (cu == null || cach < cu) tk.ngay_gan_nhat.set(mid, cach); }
    if (cach === 1) tk.nhom_hom_qua = bg.nhom_dam == null ? null : bg.nhom_dam;
    if (cach <= 2) {
      if (bg.canh) tk.canh_gan_day.push(bg.canh);
      if (bg.trang_mieng) tk.tm_gan_day.push(bg.trang_mieng);
    }
    if (cach <= soNgay - 1) {
      const nhom = bg.nhom_dam;
      tk.so_bua += 1;
      tongDiem += bg.diem || 0;
      if (NHOM_THUY_SAN.includes(nhom)) tk.thuy_san += 1;
      if (nhom === "dau") tk.dau += 1;
      if (NHOM_DONG_VAT.includes(nhom)) tk.dong_vat += 1;
      if (bg.chien) tk.chien += 1;
    }
  }
  if (tk.so_bua) tk.diem_tb = lamTron(tongDiem / tk.so_bua, 1);
  return tk;
}
function chuaDiUng(mon, diUng) { return !diUng.size || !(mon.nguyen_lieu || []).some(r => diUng.has(r.id)); }
function dungMua(mon, thang) { const mua = mon.mua || []; return !mua.length || mua.includes(thang); }
function dsTheoLoai(khoMon, loaiDs, caiDat, homNay) {
  const diUng = new Set(caiDat.di_ung || []), kq = [];
  khoMon.forEach(m => {
    if (loaiDs.includes(m.loai) && (m.bat === undefined || m.bat) && dungMua(m, homNay.thang) && chuaDiUng(m, diUng)) kq.push(m.id);
  });
  return kq;
}
function trongSoMon(mon, tk, diemUocTinh, thang, heSoGia) {
  let w = 1;
  const d = tk.ngay_gan_nhat.get(mon.id);
  w *= d == null ? 1.4 : Math.min(1.4, 0.6 + d / 30);
  const nhom = mon.nhom_dam;
  if (NHOM_THUY_SAN.includes(nhom) && tk.thuy_san < 2) w *= 2.2;
  if (nhom === "dau" && tk.dau < 2) w *= 2.4;
  if (NHOM_DONG_VAT.includes(nhom) && tk.dong_vat >= 5) w *= 0.6;
  if (mon.chien) w *= tk.chien >= 2 ? 0.1 : (tk.chien === 1 ? 0.5 : 1);
  if (nhom && nhom === tk.nhom_hom_qua) w *= 0.3;
  if (mon.mua && mon.mua.length && mon.mua.includes(thang)) w *= 1.5;
  w *= 1 + 0.08 * Math.min(nguyen(mon.tim || 0), 5);
  w *= 0.5 + Math.max(0, diemUocTinh) / 100;
  w *= heSoGia == null ? 1.0 : heSoGia;
  return Math.max(w, 0.01);
}
function _rutCoTrongSo(ds, trongSo, rng) {
  const tong = ds.reduce((a, x) => a + trongSo[x], 0);
  const r = rng.uniform(0, tong);
  let tich = 0;
  for (const x of ds) { tich += trongSo[x]; if (r <= tich) return x; }
  return ds[ds.length - 1];
}
/* Xếp vòng tròn sao cho hai ô cạnh nhau hạn chế trùng nhóm đạm */
function _xepXenKe(ids, khoMon, rng) {
  const nhom = new Map();
  for (const i of ids) {
    const k = coKhoa(khoMon.get(i), "nhom_dam") ? khoMon.get(i).nhom_dam : "";
    if (!nhom.has(k)) nhom.set(k, []);
    nhom.get(k).push(i);
  }
  nhom.forEach(v => rng.shuffle(v));
  const kq = [];
  let truoc = null;
  const conMon = () => Array.from(nhom.values()).some(v => v.length);
  while (conMon()) {
    let ung = Array.from(nhom.keys()).filter(k => nhom.get(k).length && k !== truoc)
      .sort((a, b) => nhom.get(b).length - nhom.get(a).length);
    if (!ung.length) ung = Array.from(nhom.keys()).filter(k => nhom.get(k).length);
    const k = (ung.length === 1 || nhom.get(ung[0]).length > nhom.get(ung[1]).length) ? ung[0] : rng.choice(ung.slice(0, 2));
    kq.push(nhom.get(k).pop());
    truoc = k;
  }
  /* ô cuối và ô đầu cũng kề nhau: xoay nếu trùng */
  const nd = i => khoMon.get(i).nhom_dam;
  for (let n = 0; n < kq.length; n++) {
    if (kq.length > 2 && nd(kq[0]) === nd(kq[kq.length - 1])) kq.push(kq.shift());
    else break;
  }
  return kq;
}
function taoUngVien(khoMon, lichSu, caiDat, homNay, boTinh, rng) {
  const soO = CH.SO_O;
  const tk = thongKeGanDay(lichSu, khoMon, homNay);
  const tatCa = dsTheoLoai(khoMon, ["man", "mot_to"], caiDat, homNay);
  const canhBao = [];
  if (!tatCa.length) return [[], {}, ["Chưa có món chính nào phù hợp. Hãy thêm món hoặc bỏ bớt nguyên liệu dị ứng."], tk];
  const cuaSo = nguyen(caiDat.cua_so_chong_lap == null ? 14 : caiDat.cua_so_chong_lap);
  let hopLe = [], cs = cuaSo;
  while (cs >= 0) {
    hopLe = tatCa.filter(m => (tk.ngay_gan_nhat.has(m) ? tk.ngay_gan_nhat.get(m) : 999) > cs);
    if (hopLe.length >= soO || cs === 0) break;
    cs -= 1;
  }
  if (cs < cuaSo)
    canhBao.push("Thư viện có " + tatCa.length + " món phù hợp nên máy tạm rút cửa sổ chống lặp từ " + cuaSo + " xuống " + cs +
                 " ngày. Thêm món mới để thực đơn đa dạng hơn.");
  if (!hopLe.length) hopLe = tatCa.slice();
  const dsCanh = dsTheoLoai(khoMon, ["canh"], caiDat, homNay), dsTm = dsTheoLoai(khoMon, ["trang_mieng"], caiDat, homNay);
  const tm0 = dsTm.length ? dsTm[0] : null;
  const trongSo = {};
  for (const mid of hopLe) {
    const u = boTinh.uocTinh(mid, dsCanh, tm0);
    trongSo[mid] = trongSoMon(khoMon.get(mid), tk, u[0], homNay.thang, heSoChiPhi(u[1], boTinh.mt));
  }
  /* rút 12 món không lặp, tối đa 3 món mỗi nhóm đạm (nới dần nếu thiếu) */
  const chon = [], conLai = hopLe.slice();
  let gioiHan = 3;
  const nhomCua = x => coKhoa(khoMon.get(x), "nhom_dam") ? khoMon.get(x).nhom_dam : "";
  while (chon.length < soO && conLai.length) {
    const dem = {};
    chon.forEach(c => { const n = nhomCua(c); dem[n] = (dem[n] || 0) + 1; });
    const ung = conLai.filter(x => (dem[nhomCua(x)] || 0) < gioiHan);
    if (!ung.length) { gioiHan += 1; continue; }
    const x = _rutCoTrongSo(ung, trongSo, rng);
    chon.push(x);
    conLai.splice(conLai.indexOf(x), 1);
  }
  if (chon.length < soO) {
    canhBao.push("Chỉ có " + chon.length + " món chính phù hợp nên vòng quay lặp lại một số ô.");
    const goc = chon.slice();
    let i = 0;
    while (chon.length < soO) { chon.push(goc[i % goc.length]); i += 1; }
    return [chon, trongSo, canhBao, tk];
  }
  return [_xepXenKe(chon, khoMon, rng), trongSo, canhBao, tk];
}
/* Rút chỉ số ô trúng (có trọng số), bỏ qua các ô đã trúng trước đó trong ngày */
function bocTham(ungVien, trongSo, loaiTruIdx, rng) {
  let idx = [];
  for (let i = 0; i < ungVien.length; i++) if (!loaiTruIdx.includes(i)) idx.push(i);
  if (!idx.length) idx = ungVien.map((_, i) => i);
  const w = i => coKhoa(trongSo, ungVien[i]) ? trongSo[ungVien[i]] : 1.0;
  const tong = idx.reduce((a, i) => a + w(i), 0);
  const r = rng.uniform(0, tong);
  let tich = 0;
  for (const i of idx) { tich += w(i); if (r <= tich) return i; }
  return idx[idx.length - 1];
}

/* ================================================================ BỘ ĐIỀU PHỐI (bo_dieu_phoi.py) */
const THU = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
const LOAI_MON = {man: "Món mặn ăn với cơm", mot_to: "Món một tô/đĩa", canh: "Canh, rau", trang_mieng: "Tráng miệng"};
const TRUONG_NL_SO = ["thai_bo"].concat(CHAT);
const KIEU_VONG = {mat_so: "Mặt số cố định: kim và đèn chạy, khớp mặt số in", banh_xe: "Bánh xe quay: kim đứng yên ở trên cùng"};
const KIEU_DOC = {tat_ca: "Khi có kết quả, khi chốt và khi đổi món kèm", chot: "Chỉ khi chốt món", tat: "Tắt giọng đọc"};
const NUT_RIENG = {quay: "Quay", chot: "Chốt", doi_canh: "Đổi canh", doi_trang_mieng: "Đổi tráng miệng"};
const TEN_ROBOT = "Bin";
const NHOM_NL = {bot: "Tinh bột", dam_dv: "Đạm động vật", dam_tv: "Đạm thực vật", rau: "Rau củ", trai_cay: "Trái cây",
                 sua: "Sữa", beo: "Dầu mỡ", gia_vi: "Gia vị"};
const DON_VI_MUA = ["kg", "lít", "quả", "hũ", "hộp", "trái", "bó", "gói", "chai", "con"];

function tenMuiGio(phut) {
  const dau = phut >= 0 ? "+" : "−", a = Math.abs(nguyen(phut)), h = Math.floor(a / 60), m = a % 60;
  return "UTC" + dau + h + (m ? ":" + p2(m) : "");
}
function taoId(ten, daCo) {              /* daCo: Map hoặc Set các id đã dùng */
  let s = String(ten).replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "mon";
  s = s.slice(0, 40);
  const g = s;
  let i = 2;
  while (daCo.has(s)) { s = g + "_" + i; i += 1; }
  return s;
}

/* Kho dữ liệu trong bộ nhớ; hàm luu() do môi trường cung cấp (localStorage) */
class KhoDuLieu {
  constructor(mau, luu) {
    this.mau = mau; this._luu = luu || (() => {});
    this.nguyen_lieu = new Map(); this.mon = new Map(); this.lich_su = []; this.cai_dat = Object.assign({}, CAI_DAT_MAC_DINH);
    this.phien = null; this.ghi_chu_nguon = ""; this.ghi_chu_gia = ""; this.anh_goc_tat = []; this.da_sua_thu_vien = false; this.ma_mau = mau.ma || "";
  }
  /* dữ liệu từ bản cũ chưa có giá: lấy giá của nguyên liệu cùng mã trong thư viện mẫu (giống du_lieu.py) */
  boSungGia() {
    const theoId = new Map((this.mau.nguyen_lieu || []).map(x => [x.id, x]));
    let doi = false;
    this.nguyen_lieu.forEach(x => {
      if (coKhoa(x, "gia")) return;
      const m = theoId.get(x.id) || {};
      x.gia = m.gia || 0; x.dv = m.dv || "kg"; x.g_dv = m.g_dv || 1000; x.gia_ngay = m.gia_ngay || "";
      doi = true;
    });
    if (!this.ghi_chu_gia) this.ghi_chu_gia = this.mau.gia_ghi_chu || "";
    return doi;
  }
  napThuVienMau() {
    this.nguyen_lieu = new Map(saoChep(this.mau.nguyen_lieu || []).map(x => [x.id, x]));
    this.mon = new Map(saoChep(this.mau.mon || []).map(x => [x.id, x]));
    this.ghi_chu_nguon = this.mau.ghi_chu || "";
    this.ghi_chu_gia = this.mau.gia_ghi_chu || "";
    this.da_sua_thu_vien = false; this.ma_mau = this.mau.ma || "";
  }
  napTuTrangThai(s) {
    this.nguyen_lieu = new Map((s.nguyen_lieu || []).map(x => [x.id, x]));
    this.mon = new Map((s.mon || []).map(x => [x.id, x]));
    this.lich_su = locLichSu(s.lich_su);
    this.cai_dat = Object.assign({}, CAI_DAT_MAC_DINH, s.cai_dat || {});
    this.phien = s.phien || null;
    this.ghi_chu_nguon = s.ghi_chu_nguon != null ? s.ghi_chu_nguon : (this.mau.ghi_chu || "");
    this.ghi_chu_gia = s.ghi_chu_gia || "";
    this.anh_goc_tat = s.anh_goc_tat || [];
    this.da_sua_thu_vien = !!s.da_sua_thu_vien; this.ma_mau = s.ma_mau || "";
    this.boSungGia();
  }
  trangThai() {
    return {phien_ban: 1, nguyen_lieu: Array.from(this.nguyen_lieu.values()), mon: Array.from(this.mon.values()),
            lich_su: this.lich_su, cai_dat: this.cai_dat, phien: this.phien, ghi_chu_nguon: this.ghi_chu_nguon, ghi_chu_gia: this.ghi_chu_gia,
            anh_goc_tat: this.anh_goc_tat, da_sua_thu_vien: this.da_sua_thu_vien, ma_mau: this.ma_mau};
  }
  luu() {
    if (this.lich_su.length > CH.SO_NGAY_LICH_SU_TOI_DA) this.lich_su = this.lich_su.slice(-CH.SO_NGAY_LICH_SU_TOI_DA);
    this._luu(this);
  }
  luuThuVien() { this.da_sua_thu_vien = true; this.luu(); }
  xuatTatCa() {
    return {loai: "sao_luu_may_tu_van_dinh_duong", phien_ban: 1, nguyen_lieu: Array.from(this.nguyen_lieu.values()),
            mon: Array.from(this.mon.values()), lich_su: this.lich_su, cai_dat: this.cai_dat};
  }
  nhapTatCa(dl) {
    if (!dl || typeof dl !== "object" || Array.isArray(dl) || dl.loai !== "sao_luu_may_tu_van_dinh_duong")
      throw new LoiNghiepVu("Không khôi phục được: file không phải bản sao lưu của máy tư vấn dinh dưỡng");
    const hopLe = ds => Array.isArray(ds) && ds.every(x => x && typeof x === "object" && typeof x.id === "string" && x.id);
    if (!hopLe(dl.nguyen_lieu || []) || !hopLe(dl.mon || []))
      throw new LoiNghiepVu("Không khôi phục được: danh sách món hoặc nguyên liệu trong file bị hỏng");
    this.nguyen_lieu = new Map((dl.nguyen_lieu || []).map(x => [x.id, x]));
    this.mon = new Map((dl.mon || []).map(x => [x.id, x]));
    this.lich_su = locLichSu(dl.lich_su || []);
    this.cai_dat = Object.assign({}, CAI_DAT_MAC_DINH, dl.cai_dat || {});
    this.boSungGia();                     /* bản sao lưu từ phiên bản cũ chưa có giá */
    this.da_sua_thu_vien = true;
    this.luu();
  }
}
function locLichSu(ds) {                 /* bỏ các dòng lịch sử hỏng (thiếu ngày) */
  if (!Array.isArray(ds)) return [];
  return ds.filter(x => x && typeof x === "object" && typeof x.ngay === "string" && x.ngay.length === 10);
}

/* Máy tư vấn: giữ "phiên" quay của ngày, phát sự kiện, xử lý mọi thao tác.
   mt (môi trường): bayGio() -> Date, dongHo() -> mili giây đơn điệu, hen(fn, ms), phat(loai, dl),
                    anh: {taoAnhTam(m), xoaAnh(id), coAnhThat(id)}, diaChi() */
class MayTuVan {
  constructor(kho, mt, rng) {
    this.kho = kho; this.mt = mt; this.rng = rng || taoRng();
    this.dang_quay = null; this._dem_quay = 0;
    this.phan_cung = {led: false, nut: false, lac: false, coi: false, anh_sang: null, nut_rieng: {}, kieu_nut_rieng: "",
      ghi_chu: "Đây là bản trình diễn trên web nên không có vòng LED, nút bấm, cảm biến lắc và còi thật. " +
               "Hình vòng LED ở tab Vòng quay mô phỏng đúng cách vòng LED thật sáng trên máy; phím 1, 2, 3, 4 thay cho 4 nút rời."};
  }
  /* ---------- thời gian ---------- */
  muiGioPhut() { return -this.mt.bayGio().getTimezoneOffset(); }
  bayGio() { return thoiDiem(this.mt.bayGio()); }
  homNay() { const b = this.bayGio(); return {so: b.so, iso: b.iso, thang: b.thang}; }
  dongHoGiay() { return this.mt.dongHo() / 1000; }
  dongBoGio(epochMs, muiGioPhut, muiGioTen) {
    const mg = Math.round(Number(muiGioPhut));
    if (muiGioPhut != null && !isNaN(mg) && mg >= -720 && mg <= 840) {
      this.kho.cai_dat.mui_gio_phut = mg;
      if (muiGioTen) this.kho.cai_dat.mui_gio_ten = cat(muiGioTen, 64);
      this.kho.luu();
    }
    return false;                         /* giờ của trình duyệt luôn là giờ đúng */
  }
  thongTinGio() {
    const b = this.bayGio();
    return {gio_may: p2(b.gio) + ":" + p2(b.phut) + " " + p2(b.ngay) + "/" + p2(b.thang) + "/" + b.nam,
            mui_gio: tenMuiGio(this.muiGioPhut()), mui_gio_ten: this.kho.cai_dat.mui_gio_ten || "", mui_gio_he_thong: ""};
  }
  phat(loai, dl) { this.mt.phat(loai, dl); }

  /* ---------- khởi động ---------- */
  khoiDong() {
    if (this.damBaoAnh()) this.kho.luu();
    const p = this.kho.phien;
    if (p && p.mam_cho && p.ket_qua == null) {          /* trang bị đóng giữa lúc quay: công bố luôn kết quả */
      p.ket_qua = p.da_quay && p.da_quay.length ? p.da_quay[p.da_quay.length - 1] : null;
      p.mam = p.mam_cho; delete p.mam_cho;
      this.kho.luu();
    }
    if (!this.damBaoPhien()) {
      const q = this.kho.phien || {};
      /* phiên hôm nay tạo từ bản cũ chưa có giá: tính tiền cho vòng quay và mâm (giữ nguyên các món) */
      if (!("chi_phi_uoc" in q) || (q.mam && !("chi_phi" in q.mam))) this._tinhLaiChiPhi();
    }
  }
  damBaoAnh() {
    let doi = false;
    this.kho.mon.forEach(m => {
      const that = this.mt.anh.coAnhThat(m.id);
      if (!!m.anh_that !== that) { m.anh_that = that; doi = true; }
    });
    return doi;
  }
  _boTinh() { return new BoTinhMam(this.kho.nguyen_lieu, this.kho.mon, mucTieu(this.kho.cai_dat)); }

  /* ---------- phiên trong ngày ---------- */
  damBaoPhien() {
    const hn = this.homNay().iso, p = this.kho.phien;
    if (!p || p.ngay !== hn || !(p.ung_vien && p.ung_vien.length)) { this._taoPhienMoi(); return true; }
    return false;
  }
  _taoPhienMoi() {
    const cu = this.kho.phien, hn = this.homNay();
    if (cu && cu.ngay && cu.ngay < hn.iso && cu.mam && !cu.chot) this._ghiLichSu(cu, true);   /* quên chốt hôm trước */
    const bo = this._boTinh();
    const t = taoUngVien(this.kho.mon, this.kho.lich_su, this.kho.cai_dat, hn, bo, this.rng);
    this.kho.phien = {
      ngay: hn.iso, ung_vien: t[0], trong_so: t[1], da_quay: [], ket_qua: null, mam: null, chot: false,
      chi_phi_uoc: this._chiPhiUoc(t[0], bo),
      goc: (cu || {}).goc || 0, canh_bao: t[2], da_doi: {canh: [], trang_mieng: []}, tao_luc: this._chuoiGio(true)
    };
    this.dang_quay = null;
    this.kho.luu();
    this.phat("phien_moi", this.trangThai());
  }
  _chuoiGio(coGiay) { const b = this.bayGio(); return b.iso + " " + p2(b.gio) + ":" + p2(b.phut) + (coGiay ? ":" + p2(b.giay) : ""); }
  /* tiền một suất ước tính (đã cộng chi phí khác) của từng món trên vòng quay */
  _chiPhiUoc(uv, bo) {
    bo = bo || this._boTinh();
    const hn = this.homNay(), cd = this.kho.cai_dat;
    const dsCanh = dsTheoLoai(this.kho.mon, ["canh"], cd, hn), dsTm = dsTheoLoai(this.kho.mon, ["trang_mieng"], cd, hn);
    const khac = nguyen(cd.chi_phi_khac_suat || 0), kq = {};
    for (const mid of uv) {
      if (coKhoa(kq, mid) || !this.kho.mon.has(mid)) continue;
      const u = bo.uoc.get(mid) || bo.uocTinh(mid, dsCanh, dsTm.length ? dsTm[0] : null);
      kq[mid] = lamTron(u[1]) + khac;
    }
    return kq;
  }
  _o(i, monId, p) {
    const m = this.kho.mon.get(monId), daTrung = (p.da_quay || []).includes(i);
    if (!m) return {idx: i, id: monId, ten: "(món đã xóa)", ten_ngan: "(đã xóa)", nhom_dam: "", ten_nhom: "", mau: "#9a9a9a", anh_v: 0, da_trung: daTrung};
    const nhom = m.nhom_dam || "";
    return {idx: i, id: monId, ten: m.ten, ten_ngan: m.ten_ngan || m.ten, nhom_dam: nhom, ten_nhom: (NHOM_DAM[nhom] || {}).ten || "",
            mau: hexMau(mauNhom(nhom)), anh_v: m.anh_v || 0, loai: m.loai, da_trung: daTrung,
            tien: coKhoa(p.chi_phi_uoc || {}, monId) ? p.chi_phi_uoc[monId] : null};
  }
  luotCon(p) {
    p = p || this.kho.phien;
    return Math.max(0, nguyen(this.kho.cai_dat.so_lan_quay_lai == null ? 2 : this.kho.cai_dat.so_lan_quay_lai) + 1 - (p.da_quay || []).length);
  }
  trangThai() {
    const p = this.kho.phien || {}, bn = this.bayGio();
    let dq = null;
    if (this.dang_quay) {
      const daTroi = this.dongHoGiay() - this.dang_quay.t0;
      if (daTroi < this.dang_quay.thoi_gian) { dq = Object.assign({}, this.dang_quay); delete dq.t0; dq.da_troi = daTroi; }
    }
    const tk = thongKeGanDay(this.kho.lich_su, this.kho.mon, ngayCong(this.homNay(), 1), 7);
    return {
      ngay: p.ngay == null ? null : p.ngay,
      ngay_hien_thi: THU[bn.thu] + ", " + bn.ngay + "/" + bn.thang + "/" + bn.nam,
      gio: p2(bn.gio) + ":" + p2(bn.phut),
      gio_ms: Date.now(), mui_gio_phut: this.muiGioPhut(),
      may_ms: Math.round(this.mt.dongHo()),
      ung_vien: (p.ung_vien || []).map((mid, i) => this._o(i, mid, p)),
      da_quay: p.da_quay || [],
      ket_qua: p.ket_qua == null ? null : p.ket_qua,
      mam: p.mam || null,
      chot: !!p.chot,
      luot_con: p.ung_vien ? this.luotCon(p) : 0,
      goc: p.goc || 0,
      dang_quay: dq,
      canh_bao: p.canh_bao || [],
      muc_tieu: mucTieu(this.kho.cai_dat),
      meo: MEO_DINH_DUONG[(bn.so + 719163) % MEO_DINH_DUONG.length],
      can_dong_bo_gio: false,
      co_ma: !!this.kho.cai_dat.ma_quan_tri,
      phan_cung: Object.assign({}, this.phan_cung),
      tuan: {thuy_san: tk.thuy_san, dau: tk.dau, chien: tk.chien, so_bua: tk.so_bua, diem_tb: tk.diem_tb},
      so_nguoi_di_cho: this.kho.cai_dat.so_nguoi_di_cho == null ? 30 : this.kho.cai_dat.so_nguoi_di_cho,
      ten_robot: TEN_ROBOT,
      kieu_vong: this.kieuVong(),
      giong_doc: coKhoa(KIEU_DOC, this.kho.cai_dat.giong_doc || "") ? this.kho.cai_dat.giong_doc : "tat_ca",
      mo_dau: this.kho.cai_dat.mo_dau !== false,
      ai: {bat: this.kho.cai_dat.ai_bat !== false},
      thong_tin: this.thongTin()
    };
  }

  /* ---------- quay ---------- */
  _taoMam(monId, coDinhCanh, coDinhTm, themBoQua) {
    const hn = this.homNay(), cd = this.kho.cai_dat;
    const dsCanh = dsTheoLoai(this.kho.mon, ["canh"], cd, hn), dsTm = dsTheoLoai(this.kho.mon, ["trang_mieng"], cd, hn);
    const tk = thongKeGanDay(this.kho.lich_su, this.kho.mon, hn);
    const boQua = {canh: tk.canh_gan_day.slice(), trang_mieng: tk.tm_gan_day.slice()};
    Object.keys(themBoQua || {}).forEach(k => { boQua[k] = (boQua[k] || []).concat(themBoQua[k]); });
    return this._boTinh().taoMam(monId, dsCanh, dsTm, this.rng, coDinhCanh || null, coDinhTm || null, boQua);
  }
  dangQuayThat() { const dq = this.dang_quay; return !!dq && this.dongHoGiay() < dq.t0 + dq.thoi_gian + 0.4; }
  yeuCauQuay(nguon) {
    this.damBaoPhien();
    const p = this.kho.phien;
    if (this.dangQuayThat()) throw new LoiNghiepVu("Vòng quay đang chạy");
    if (p.chot) throw new LoiNghiepVu("Món hôm nay đã chốt");
    if (!(p.ung_vien && p.ung_vien.length)) throw new LoiNghiepVu("Chưa có món nào để quay, hãy thêm món trong Thư viện");
    if (this.luotCon(p) <= 0) throw new LoiNghiepVu("Đã hết lượt quay hôm nay");
    const thieu = [];
    p.ung_vien.forEach((mid, i) => { if (!this.kho.mon.has(mid)) thieu.push(i); });
    const idx = bocTham(p.ung_vien, p.trong_so || {}, p.da_quay.concat(thieu), this.rng);
    const monId = p.ung_vien[idx];
    if (!this.kho.mon.has(monId)) throw new LoiNghiepVu("Các món trên vòng quay đã bị xóa, hãy làm mới vòng quay");
    const mam = this._taoMam(monId);
    const batDau = modDuong(Number(p.goc || 0), 360);
    const lech = this.rng.uniform(-9, 9);
    const dich = modDuong(360 - (idx * 30 + 15 + lech), 360);
    const delta = CH.SO_VONG_QUAY * 360 + modDuong(dich - batDau, 360);
    this._dem_quay += 1;
    /* hẹn thời điểm bắt đầu theo đồng hồ đơn điệu, giống máy thật */
    const t0 = this.dongHoGiay() + CH.DO_TRE_DONG_BO;
    const spin = {id: this._dem_quay, t0_ms: Math.round(t0 * 1000), bat_dau_goc: batDau, delta: delta, thoi_gian: CH.THOI_GIAN_QUAY,
                  idx: idx, nguon: nguon, mau: p.ung_vien.map((m, i) => this._o(i, m, p).mau)};
    spin.mam = mam;
    this.dang_quay = Object.assign({}, spin, {t0: t0});
    p.goc = modDuong(batDau + delta, 360);
    p.da_quay.push(idx);
    p.ket_qua = null; p.mam = null; p.mam_cho = mam;
    p.da_doi = {canh: [], trang_mieng: []};
    this.kho.luu();
    spin.t_gui_ms = Math.round(this.mt.dongHo());
    this.phat("quay", spin);
    const id = spin.id;
    this.mt.hen(() => this._ketThucQuay(id), (CH.DO_TRE_DONG_BO + CH.THOI_GIAN_QUAY + 0.15) * 1000);
    return spin;
  }
  _ketThucQuay(spinId) {
    if (!this.dang_quay || this.dang_quay.id !== spinId) return;
    const p = this.kho.phien, idx = this.dang_quay.idx;
    p.ket_qua = idx;
    p.mam = p.mam_cho || null; delete p.mam_cho;
    this.dang_quay = null;
    this.kho.luu();
    this.phat("ket_qua", {idx: idx, mam: p.mam, luot_con: this.luotCon(p)});
  }
  chot(nguon) {
    const p = this.kho.phien;
    if (this.dangQuayThat()) throw new LoiNghiepVu("Chờ vòng quay dừng rồi hãy chốt");
    if (p.ket_qua == null || !p.mam) throw new LoiNghiepVu("Chưa có món để chốt, hãy quay trước");
    if (p.chot) return p.mam;
    p.chot = true;
    this._ghiLichSu(p);
    this.kho.luu();
    const dl = {idx: p.ket_qua, mam: p.mam, nguon: nguon};
    this.phat("chot", dl);
    return dl;
  }
  huyChot() {
    const p = this.kho.phien;
    if (!p.chot) return;
    p.chot = false;
    this.kho.lich_su = this.kho.lich_su.filter(x => x.ngay !== p.ngay);
    this.kho.luu();
    this.phat("cap_nhat", {ly_do: "huy_chot"});
  }
  chonTay(idx) {
    const p = this.kho.phien;
    if (p.chot) throw new LoiNghiepVu("Món hôm nay đã chốt, hãy hủy chốt trước");
    if (this.dangQuayThat()) throw new LoiNghiepVu("Vòng quay đang chạy");
    idx = nguyen(idx);
    if (!(idx >= 0 && idx < (p.ung_vien || []).length)) throw new LoiNghiepVu("Ô không hợp lệ");
    const monId = p.ung_vien[idx];
    if (!this.kho.mon.has(monId)) throw new LoiNghiepVu("Món này đã bị xóa");
    p.ket_qua = idx;
    p.mam = this._taoMam(monId);
    delete p.mam_cho;
    if (!p.da_quay.includes(idx)) p.da_quay.push(idx);
    p.da_doi = {canh: [], trang_mieng: []};
    this.kho.luu();
    const dl = {idx: idx, mam: p.mam, luot_con: this.luotCon(p), chon_tay: true};
    this.phat("ket_qua", dl);
    return dl;
  }
  /* Một lần nhấn nút rời (ở bản trình diễn là phím 1–4). true: đã làm, null: bỏ qua, false: không làm được */
  bamNut(ma, nguon) {
    if (!coKhoa(NUT_RIENG, ma)) return false;
    this.phat("nut_bam", {nut: ma, ten: NUT_RIENG[ma], nguon: nguon});
    let muc = "loi";
    try {
      this.damBaoPhien();
      const p = this.kho.phien || {}, dangQuay = this.dangQuayThat();
      if (ma === "quay") {
        if (dangQuay) return null;
        if (p.chot) { muc = "thong_tin"; throw new LoiNghiepVu("Món hôm nay đã chốt rồi. Mai mình cùng quay tiếp nha!"); }
        if (p.ung_vien && p.ung_vien.length && this.luotCon(p) <= 0)
          throw new LoiNghiepVu("Hết lượt quay hôm nay rồi. Nhấn nút Chốt để chốt mâm này nha.");
        this.yeuCauQuay(nguon);
      } else if (ma === "chot") {
        if (dangQuay) throw new LoiNghiepVu("Chờ vòng quay dừng rồi hãy chốt nha.");
        if (p.chot) { muc = "thong_tin"; throw new LoiNghiepVu("Món hôm nay đã chốt rồi. Chúc bạn ăn ngon miệng nha!"); }
        if (p.ket_qua == null || !p.mam) throw new LoiNghiepVu("Chưa có món để chốt. Nhấn nút Quay trước nha.");
        this.chot(nguon);
      } else {
        if (dangQuay) throw new LoiNghiepVu("Chờ vòng quay dừng rồi hãy đổi món nha.");
        if (!p.mam) throw new LoiNghiepVu("Chưa có mâm để đổi. Nhấn nút Quay trước nha.");
        this.doiKem(ma === "doi_canh" ? "canh" : "trang_mieng", nguon);
      }
    } catch (e) {
      if (!(e instanceof LoiNghiepVu)) throw e;
      this.phat("thong_bao", {noi_dung: e.message, nguon: nguon, nut: ma, muc: muc});
      return false;
    }
    return true;
  }
  doiKem(loai, nguon, chon) {
    if (loai !== "canh" && loai !== "trang_mieng") throw new LoiNghiepVu("Chỉ đổi được canh hoặc tráng miệng");
    const p = this.kho.phien, mam = p.mam;
    if (!mam) throw new LoiNghiepVu("Chưa có mâm để đổi");
    if (loai === "canh" && !mam.canh) throw new LoiNghiepVu("Món một tô không kèm canh");
    const hien = (mam[loai] || {}).id;
    if (!p.da_doi) p.da_doi = {canh: [], trang_mieng: []};
    const daDoi = p.da_doi;
    if (hien && !daDoi[loai].includes(hien)) daDoi[loai].push(hien);
    const ds = dsTheoLoai(this.kho.mon, [loai], this.kho.cai_dat, this.homNay());
    if (chon != null && !ds.includes(chon)) throw new LoiNghiepVu("Món này không dùng được để đổi (đã tắt hoặc có nguyên liệu cần tránh)");
    if (!ds.filter(x => !daDoi[loai].includes(x)).length) daDoi[loai] = hien ? [hien] : [];
    const khac = loai === "canh" ? (mam.trang_mieng || {}).id : (mam.canh || {}).id;
    const moi = chon != null
      ? this._taoMam(mam.mon.id, loai === "canh" ? chon : khac, loai === "canh" ? khac : chon)
      : loai === "canh"
        ? this._taoMam(mam.mon.id, null, khac, {canh: daDoi.canh})
        : this._taoMam(mam.mon.id, khac, null, {trang_mieng: daDoi.trang_mieng});
    p.mam = moi;
    if (p.chot) this._ghiLichSu(p);
    this.kho.luu();
    const dl = {idx: p.ket_qua, mam: moi, luot_con: this.luotCon(p), doi_kem: loai, nguon: nguon || "web"};
    this.phat("ket_qua", dl);
    return dl;
  }
  lamMoiUngVien() {
    if ((this.kho.phien || {}).chot) throw new LoiNghiepVu("Món hôm nay đã chốt, hãy hủy chốt trước");
    if (this.dangQuayThat()) throw new LoiNghiepVu("Vòng quay đang chạy");
    this.kho.phien = Object.assign({}, this.kho.phien || {}, {ngay: null});
    this._taoPhienMoi();
  }
  _ghiLichSu(p, tuDong) {
    const mam = p.mam || {}, mon = mam.mon || {};
    const banGhi = {
      ngay: p.ngay, mon: mon.id, ten: mon.ten, nhom_dam: mon.nhom_dam, chien: mon.chien || false,
      canh: (mam.canh || {}).id || null, ten_canh: (mam.canh || {}).ten || null,
      trang_mieng: (mam.trang_mieng || {}).id || null, ten_trang_mieng: (mam.trang_mieng || {}).ten || null,
      diem: mam.diem || 0, kcal: (mam.tong || {}).kcal || 0, tu_dong: !!tuDong, luc: this._chuoiGio(false)
    };
    const cp = mam.chi_phi;
    if (cp) {
      const soSuat = nguyen(this.kho.cai_dat.so_nguoi_di_cho == null ? 30 : this.kho.cai_dat.so_nguoi_di_cho);
      Object.assign(banGhi, {tien_suat: cp.suat || 0, dinh_muc: cp.dinh_muc || 0, so_suat: soSuat, tong_tien: (cp.suat || 0) * soSuat});
    }
    this.kho.lich_su = this.kho.lich_su.filter(x => x.ngay !== p.ngay);
    this.kho.lich_su.push(banGhi);
    this.kho.lich_su.sort((a, b) => (a.ngay || "") < (b.ngay || "") ? -1 : (a.ngay || "") > (b.ngay || "") ? 1 : 0);
    this.kho.luu();
  }

  /* ---------- thư viện món ---------- */
  dsMon() {
    return Array.from(this.kho.mon.values()).map(m => Object.assign({}, m, {
      dinh_duong: tinhNhanhMon(m, this.kho.nguyen_lieu), mau: hexMau(mauNhom(m.nhom_dam))}));
  }
  luuMon(dl) {
    const ten = String(dl.ten || "").trim();
    if (!ten) throw new LoiNghiepVu("Tên món không được để trống");
    const loai = dl.loai;
    if (!coKhoa(LOAI_MON, loai)) throw new LoiNghiepVu("Loại món không hợp lệ");
    let nhom = dl.nhom_dam || "";
    if ((loai === "man" || loai === "mot_to") && !coKhoa(NHOM_DAM, nhom)) throw new LoiNghiepVu("Hãy chọn nhóm chất đạm chính cho món");
    if (loai !== "man" && loai !== "mot_to") nhom = "";
    const dsNl = [];
    for (const r of (dl.nguyen_lieu || [])) {
      const nid = r.id;
      let g = Number(r.g == null ? 0 : r.g);
      if (isNaN(g)) g = 0;
      if (!this.kho.nguyen_lieu.has(nid)) throw new LoiNghiepVu("Nguyên liệu '" + nid + "' chưa có trong kho");
      if (g <= 0 || g > 2000) throw new LoiNghiepVu("Khối lượng nguyên liệu phải từ 0 đến 2000 g");
      const dong = {id: nid, g: lamTron(g, 1)};
      if (r.dc && loai === "mot_to") dong.dc = true;
      dsNl.push(dong);
    }
    if (!dsNl.length) throw new LoiNghiepVu("Món cần ít nhất một nguyên liệu");
    if (loai === "mot_to" && !dsNl.some(x => x.dc))
      throw new LoiNghiepVu("Món một tô cần đánh dấu nguyên liệu tinh bột (bún, phở, cơm...) để máy điều chỉnh khẩu phần");
    let mid = dl.id;
    const moi = !mid || !this.kho.mon.has(mid);
    let cu;
    if (moi) { mid = taoId(ten, this.kho.mon); cu = {tim: 0, anh_that: false, anh_v: 0, bat: true}; }
    else cu = this.kho.mon.get(mid);
    const tenNgan = String(dl.ten_ngan || "").trim() || ten;
    const mua = Array.from(new Set((dl.mua || []).map(x => nguyen(x)).filter(x => x >= 1 && x <= 12))).sort((a, b) => a - b);
    const goiY = (dl.goi_y_canh || []).filter(c => this.kho.mon.has(c) && this.kho.mon.get(c).loai === "canh");
    let cach = dl.cach_lam || [];
    if (typeof cach === "string") cach = cach.split("\n").map(x => x.trim());
    cach = cach.filter(x => x).slice(0, 15);
    const m = {
      id: mid, ten: cat(ten, 80), ten_ngan: cat(tenNgan, 16), loai: loai, nhom_dam: nhom, chien: !!dl.chien, mua: mua,
      bat: dl.bat === undefined ? true : !!dl.bat, tim: nguyen(cu.tim || 0), mo_ta: cat(String(dl.mo_ta || "").trim(), 300),
      cach_lam: cach, nguyen_lieu: dsNl, goi_y_canh: loai === "man" ? goiY : [], anh_that: !!cu.anh_that, anh_v: cu.anh_v || 0
    };
    const doiTen = !moi && cu.ten !== m.ten;
    this.kho.mon.set(mid, m);
    if (moi || (doiTen && !m.anh_that)) { this.mt.anh.taoAnhTam(m); m.anh_v = Math.floor(Date.now() / 1000); }
    this.kho.luuThuVien();
    this.phat("cap_nhat", {ly_do: "thu_vien"});
    return m;
  }
  xoaMon(mid) {
    if (!this.kho.mon.has(mid)) throw new LoiNghiepVu("Không tìm thấy món");
    const p = this.kho.phien || {};
    if (p.mam && (p.mam.mon || {}).id === mid) throw new LoiNghiepVu("Món này đang là món của hôm nay, không xóa được");
    this.kho.mon.delete(mid);
    this.kho.mon.forEach(m => { const i = (m.goi_y_canh || []).indexOf(mid); if (i >= 0) m.goi_y_canh.splice(i, 1); });
    this.mt.anh.xoaAnh(mid);
    this.kho.luuThuVien();
    this.phat("cap_nhat", {ly_do: "thu_vien"});
  }
  batTatMon(mid, bat) {
    if (!this.kho.mon.has(mid)) throw new LoiNghiepVu("Không tìm thấy món");
    this.kho.mon.get(mid).bat = !!bat;
    this.kho.luuThuVien();
    this.phat("cap_nhat", {ly_do: "thu_vien"});
  }
  thaTim(mid) {
    if (!this.kho.mon.has(mid)) throw new LoiNghiepVu("Không tìm thấy món");
    const m = this.kho.mon.get(mid);
    m.tim = Math.min(999, nguyen(m.tim || 0) + 1);
    this.kho.luuThuVien();
    return m.tim;
  }
  async luuAnhMon(mid, file) {
    if (!this.kho.mon.has(mid)) throw new LoiNghiepVu("Không tìm thấy món");
    let v;
    try { v = await this.mt.anh.xuLyAnhTaiLen(file, mid); }
    catch (e) { throw new LoiNghiepVu("Không đọc được ảnh: " + (e && e.message ? e.message : e)); }
    const m = this.kho.mon.get(mid);
    m.anh_that = true; m.anh_v = v;
    this._capNhatAnhTrongPhien(mid, v);
    this.kho.luuThuVien();
    this.phat("anh_moi", {id: mid, anh_v: v});
    this.phat("cap_nhat", {ly_do: "anh"});
    return v;
  }
  xoaAnhMon(mid) {
    if (!this.kho.mon.has(mid)) throw new LoiNghiepVu("Không tìm thấy món");
    this.mt.anh.xoaAnh(mid);
    const m = this.kho.mon.get(mid);
    this.mt.anh.taoAnhTam(m);
    m.anh_that = false; m.anh_v = Math.floor(Date.now() / 1000);
    this._capNhatAnhTrongPhien(mid, m.anh_v);
    this.kho.luuThuVien();
    this.phat("anh_moi", {id: mid, anh_v: m.anh_v});
    this.phat("cap_nhat", {ly_do: "anh"});
  }
  _capNhatAnhTrongPhien(mid, v) {
    const mam = (this.kho.phien || {}).mam || {};
    ["mon", "canh", "trang_mieng"].forEach(k => {
      if ((mam[k] || {}).id === mid) { mam[k].anh_v = v; mam[k].anh_that = this.mt.anh.coAnhThat(mid); }
    });
    this.kho.luu();
  }

  /* ---------- nguyên liệu ---------- */
  luuNguyenLieu(dl) {
    const ten = String(dl.ten || "").trim();
    if (!ten) throw new LoiNghiepVu("Tên nguyên liệu không được để trống");
    const nhom = dl.nhom;
    if (!coKhoa(NHOM_NL, nhom)) throw new LoiNghiepVu("Nhóm nguyên liệu không hợp lệ");
    let nid = dl.id;
    if (!nid || !this.kho.nguyen_lieu.has(nid)) nid = taoId(ten, this.kho.nguyen_lieu);
    const cu = this.kho.nguyen_lieu.get(nid) || {};
    const x = Object.assign({id: nid, ten: cat(ten, 60), nhom: nhom, uoc_tinh: !!dl.uoc_tinh}, this._kiemGia(dl, cu));
    for (const k of TRUONG_NL_SO) {
      const tho = dl[k];
      const v = (tho === undefined || tho === null || tho === "" || tho === 0 || tho === false) ? 0 : Number(tho);
      if (isNaN(v)) throw new LoiNghiepVu("Giá trị '" + k + "' phải là số");
      if (v < 0 || v > 100000) throw new LoiNghiepVu("Giá trị '" + k + "' không hợp lệ");
      x[k] = lamTron(v, 2);
    }
    if (x.thai_bo >= 95) throw new LoiNghiepVu("Tỉ lệ thải bỏ phải nhỏ hơn 95%");
    this.kho.nguyen_lieu.set(nid, x);
    this.kho.luuThuVien();
    if (x.gia !== cu.gia || x.g_dv !== cu.g_dv || x.thai_bo !== cu.thai_bo) this._tinhLaiChiPhi();
    this.phat("cap_nhat", {ly_do: "nguyen_lieu"});
    return x;
  }
  _kiemGia(dl, cu) {
    const lay = (k, md) => coKhoa(dl, k) ? dl[k] : (coKhoa(cu, k) ? cu[k] : md);
    const giaTho = lay("gia", 0);
    let gia = (giaTho === null || giaTho === "" || giaTho === false) ? 0 : Number(giaTho);
    if (isNaN(gia)) throw new LoiNghiepVu("Giá phải là số (đồng)");
    if (!(gia >= 0 && gia <= 50000000)) throw new LoiNghiepVu("Giá không hợp lệ");
    const dv = cat(String(lay("dv", "kg") || "kg").trim(), 10) || "kg";
    const gTho = lay("g_dv", 1000);
    let gDv = (gTho === null || gTho === "") ? 1000 : Number(gTho);
    if (isNaN(gDv)) throw new LoiNghiepVu("Khối lượng một đơn vị phải là số gam");
    if (dv === "kg") gDv = 1000;
    if (!(gDv >= 1 && gDv <= 100000)) throw new LoiNghiepVu("Khối lượng một đơn vị phải từ 1 đến 100.000 g");
    gia = lamTron(gia);
    let ngay = cu.gia_ngay || "";
    if (gia !== cu.gia || !ngay) ngay = gia > 0 ? this.homNay().iso : "";
    return {gia: gia, dv: dv, g_dv: lamTron(gDv, 1), gia_ngay: ngay};
  }
  capNhatGia(ds) {
    if (!Array.isArray(ds)) throw new LoiNghiepVu("Dữ liệu giá không hợp lệ");
    let doi = 0;
    for (const r of ds) {
      const x = this.kho.nguyen_lieu.get((r || {}).id);
      if (!x) continue;
      const moi = this._kiemGia({gia: r.gia}, x);
      if (moi.gia !== x.gia) { Object.assign(x, moi); doi += 1; }
    }
    if (doi) { this.kho.luuThuVien(); this._tinhLaiChiPhi(); this.phat("cap_nhat", {ly_do: "nguyen_lieu"}); }
    return doi;
  }
  /* giá thay đổi: tính lại tiền của mâm hôm nay (giữ nguyên các món) và giá ước tính trên vòng quay */
  _tinhLaiChiPhi() {
    const p = this.kho.phien;
    if (!p || this.dangQuayThat()) return;
    p.chi_phi_uoc = this._chiPhiUoc(p.ung_vien || []);
    const mam = p.mam;
    if (mam && mam.mon && this.kho.mon.has(mam.mon.id)) {
      p.mam = this._taoMam(mam.mon.id, (mam.canh || {}).id, (mam.trang_mieng || {}).id);
      if (p.chot) this._ghiLichSu(p);
    }
    this.kho.luu();
  }
  xoaNguyenLieu(nid) {
    if (!this.kho.nguyen_lieu.has(nid)) throw new LoiNghiepVu("Không tìm thấy nguyên liệu");
    const dung = Array.from(this.kho.mon.values()).filter(m => (m.nguyen_lieu || []).some(r => r.id === nid)).map(m => m.ten);
    if (dung.length) throw new LoiNghiepVu("Nguyên liệu đang dùng trong: " + dung.slice(0, 5).join(", "));
    this.kho.nguyen_lieu.delete(nid);
    const du = this.kho.cai_dat.di_ung || [];
    if (du.includes(nid)) du.splice(du.indexOf(nid), 1);
    this.kho.luuThuVien();
    this.phat("cap_nhat", {ly_do: "nguyen_lieu"});
  }

  /* ---------- cài đặt ---------- */
  capNhatCaiDat(dl) {
    const cd = Object.assign({}, this.kho.cai_dat);
    if (coKhoa(dl, "ho_so")) { if (!coKhoa(HO_SO, dl.ho_so)) throw new LoiNghiepVu("Hồ sơ không hợp lệ"); cd.ho_so = dl.ho_so; }
    if (coKhoa(dl, "bua")) { if (!coKhoa(BUA, dl.bua)) throw new LoiNghiepVu("Bữa ăn không hợp lệ"); cd.bua = dl.bua; }
    const so = (k, lo, hi) => {
      if (!coKhoa(dl, k)) return;
      const v = nguyen(dl[k] === "" || dl[k] == null ? NaN : Number(dl[k]));
      if (isNaN(v)) throw new LoiNghiepVu("Giá trị '" + k + "' phải là số");
      if (!(lo <= v && v <= hi)) throw new LoiNghiepVu("Giá trị '" + k + "' phải từ " + lo + " đến " + hi);
      cd[k] = v;
    };
    so("nang_luong_tuy_chinh", 0, 5000);
    so("cua_so_chong_lap", 0, 60);
    so("so_lan_quay_lai", 0, 10);
    so("so_nguoi_di_cho", 1, 5000);
    so("dinh_muc_suat", 0, 1000000);
    so("chi_phi_khac_suat", 0, 200000);
    so("uu_tien_chi_phi", 0, 2);
    so("do_sang_led", 5, 255);
    so("am_luong_giong", 10, 100);
    if (coKhoa(dl, "giong_doc")) {
      if (!coKhoa(KIEU_DOC, dl.giong_doc)) throw new LoiNghiepVu("Kiểu giọng đọc không hợp lệ");
      cd.giong_doc = dl.giong_doc;
    }
    if (cd.nang_luong_tuy_chinh && cd.nang_luong_tuy_chinh < 800)
      throw new LoiNghiepVu("Năng lượng tùy chỉnh nên từ 800 kcal/ngày trở lên, hoặc để 0");
    THONG_TIN.forEach(([k, dai]) => { if (coKhoa(dl, k)) cd[k] = gonChu(dl[k], dai); });
    if (coKhoa(dl, "kieu_vong")) {
      if (!coKhoa(KIEU_VONG, dl.kieu_vong)) throw new LoiNghiepVu("Kiểu vòng quay không hợp lệ");
      cd.kieu_vong = dl.kieu_vong;
    }
    ["coi", "lac_de_quay", "tu_chinh_do_sang", "mo_dau", "ai_bat"].forEach(k => { if (coKhoa(dl, k)) cd[k] = !!dl[k]; });
    if (coKhoa(dl, "di_ung")) cd.di_ung = (dl.di_ung || []).filter(x => this.kho.nguyen_lieu.has(x));
    if (coKhoa(dl, "ma_quan_tri")) cd.ma_quan_tri = cat(String(dl.ma_quan_tri || ""), 20);
    const cu = this.kho.cai_dat;
    const doiUngVien = !cungNoiDung(cu.di_ung, cd.di_ung) ||
      ["cua_so_chong_lap", "dinh_muc_suat", "chi_phi_khac_suat", "uu_tien_chi_phi"].some(k => cu[k] !== cd[k]);
    const doiKhauPhan = doiUngVien || ["ho_so", "bua", "nang_luong_tuy_chinh"].some(k => cu[k] !== cd[k]);
    this.kho.cai_dat = cd;
    this.kho.luu();
    const p = this.kho.phien || {};
    if (doiUngVien && !p.chot && !this.dangQuayThat() && p.ket_qua == null) {
      this.kho.phien = Object.assign({}, p, {ngay: null});
      this._taoPhienMoi();
    } else if (doiKhauPhan && p.mam && !this.dangQuayThat()) {
      const mam = p.mam;
      p.mam = this._taoMam(mam.mon.id, (mam.canh || {}).id, (mam.trang_mieng || {}).id);
      if (p.chot) this._ghiLichSu(p);
      this.kho.luu();
    }
    this.phat("cai_dat", this.caiDatPhanCung());
    this.phat("cap_nhat", {ly_do: "cai_dat"});
    return this.caiDatCongKhai();
  }
  thongTin() {
    const cd = this.kho.cai_dat;
    const tt = {};
    THONG_TIN.forEach(([k, dai]) => { tt[k] = gonChu(cd[k], dai); });
    return tt;
  }
  kieuVong() { const k = this.kho.cai_dat.kieu_vong; return coKhoa(KIEU_VONG, k || "") ? k : "mat_so"; }
  caiDatPhanCung() {
    const cd = this.kho.cai_dat;
    return {do_sang_led: cd.do_sang_led == null ? 110 : cd.do_sang_led, coi: cd.coi == null ? true : cd.coi,
            lac_de_quay: cd.lac_de_quay == null ? true : cd.lac_de_quay, tu_chinh_do_sang: cd.tu_chinh_do_sang == null ? true : cd.tu_chinh_do_sang,
            kieu_vong: this.kieuVong()};
  }
  caiDatCongKhai() {
    const cd = Object.assign({}, this.kho.cai_dat);
    cd.co_ma = !!cd.ma_quan_tri; delete cd.ma_quan_tri;
    return {
      cai_dat: cd,
      ho_so: Object.keys(HO_SO).map(k => Object.assign({}, HO_SO[k], {id: k})),
      bua: Object.keys(BUA).map(k => Object.assign({}, BUA[k], {id: k})),
      nhom_dam: Object.keys(NHOM_DAM).map(k => ({id: k, ten: NHOM_DAM[k].ten, mau: hexMau(NHOM_DAM[k].mau)})),
      loai_mon: Object.keys(LOAI_MON).map(k => ({id: k, ten: LOAI_MON[k]})),
      nhom_nl: Object.keys(NHOM_NL).map(k => ({id: k, ten: NHOM_NL[k]})),
      don_vi_mua: DON_VI_MUA.slice(),
      uu_tien_chi_phi: Object.keys(UU_TIEN_CHI_PHI).map(k => ({id: Number(k), ten: UU_TIEN_CHI_PHI[k]})),
      ghi_chu_gia: this.kho.ghi_chu_gia,
      muc_tieu: mucTieu(this.kho.cai_dat),
      phan_cung: Object.assign({}, this.phan_cung),
      dia_chi: this.mt.diaChi(),
      gio_may: this.thongTinGio().gio_may,
      gio: this.thongTinGio(),
      ghi_chu_nguon: this.kho.ghi_chu_nguon,
      ten_robot: TEN_ROBOT,
      nut_ten: Object.keys(NUT_RIENG).map(k => ({id: k, ten: NUT_RIENG[k]})),
      kieu_vong: Object.keys(KIEU_VONG).map(k => ({id: k, ten: KIEU_VONG[k]})),
      giong_doc: Object.keys(KIEU_DOC).map(k => ({id: k, ten: KIEU_DOC[k]})),
      giong_mau: thongTinGiongMau()
    };
  }
  /* ---------- chào mở đầu (giống bo_dieu_phoi.py) ---------- */
  buoiChao() {
    const g = this.bayGio().gio;
    return g >= 4 && g < 11 ? "chao_sang" : g >= 11 && g < 13 ? "chao_trua" : g >= 13 && g < 18 ? "chao_chieu" : g >= 18 && g < 22 ? "chao_toi" : "chao";
  }
  moDau() { this.phat("mo_dau", {thu: true, buoi: this.buoiChao(), tre: 0.3, loa: null}); }
  kiemTraMa(ma) { const dung = this.kho.cai_dat.ma_quan_tri || ""; return !dung || ma === dung; }

  /* ---------- lịch sử ---------- */
  lichSu(soNgay) {
    soNgay = soNgay || 60;
    const hn = this.homNay();
    const ds = this.kho.lich_su.slice(-soNgay).reverse().map(x => {
      const y = Object.assign({}, x), m = this.kho.mon.get(x.mon);
      y.anh_v = m ? (m.anh_v || 0) : 0; y.con_trong_thu_vien = !!m;
      return y;
    });
    const dem = new Map();
    this.kho.lich_su.forEach(x => {
      const d = soTuIso(x.ngay);
      if (d != null && hn.so - d < 30) { const k = x.nhom_dam || ""; dem.set(k, (dem.get(k) || 0) + 1); }
    });
    const ngayMai = ngayCong(hn, 1);
    const tk = thongKeGanDay(this.kho.lich_su, this.kho.mon, ngayMai, 7), tk14 = thongKeGanDay(this.kho.lich_su, this.kho.mon, ngayMai, 14);
    const chiPhi = {};
    for (const soN of [7, 30]) {
      const dsN = this.kho.lich_su.filter(x => { const d = soTuIso(x.ngay); return d != null && hn.so - d >= 0 && hn.so - d < soN && x.tien_suat; });
      const n = dsN.length;
      chiPhi["ngay_" + soN] = {
        so_bua: n,
        tong: dsN.reduce((a, x) => a + nguyen(x.tong_tien || 0), 0),
        tb_suat: n ? lamTron(dsN.reduce((a, x) => a + x.tien_suat, 0) / n) : 0,
        vuot: dsN.filter(x => x.dinh_muc && x.tien_suat > x.dinh_muc).length
      };
    }
    chiPhi.dinh_muc = nguyen(this.kho.cai_dat.dinh_muc_suat || 0);
    return {
      ds: ds,
      tuan: {thuy_san: tk.thuy_san, dau: tk.dau, chien: tk.chien, dong_vat: tk.dong_vat, so_bua: tk.so_bua, diem_tb: tk.diem_tb},
      diem_tb_14: tk14.diem_tb, so_bua_14: tk14.so_bua,
      chi_phi: chiPhi,
      nhom_30_ngay: Array.from(dem.entries()).sort((a, b) => b[1] - a[1])
        .map(kv => ({id: kv[0], ten: (NHOM_DAM[kv[0]] || {}).ten || "Khác", mau: hexMau(mauNhom(kv[0])), so: kv[1]}))
    };
  }
  xoaLichSu() { this.kho.lich_su = []; this.kho.luu(); this.phat("cap_nhat", {ly_do: "lich_su"}); }
  thuLed() { this.phat("thu_led", {giay: 5}); }

  /* ---------- sao lưu, khôi phục ---------- */
  sauKhiNapLai() {
    this.damBaoAnh();
    if (!(this.kho.phien || {}).chot) this.kho.phien = Object.assign({}, this.kho.phien || {}, {ngay: null});
    this.kho.luu();
    this.damBaoPhien();
  }
  khoiPhuc(dl) {
    this.kho.nhapTatCa(dl);
    this.sauKhiNapLai();
    this.phat("cai_dat", this.caiDatPhanCung());
    this.phat("cap_nhat", {ly_do: "khoi_phuc"});
  }
  khoiPhucMau() {
    this.kho.napThuVienMau();
    this.sauKhiNapLai();
    this.phat("cap_nhat", {ly_do: "khoi_phuc_mau"});
  }
}

const LOI_MAY = {
  CH, CAI_DAT_MAC_DINH, lamTron, taoRng, LoiNghiepVu, CanMaQuanTri, thoiDiem, soTuIso, isoTuSo,
  HO_SO, BUA, NHOM_DAM, CHAT, I_TIEN, vecMon, vecNguyenLieu, tomTatVec, tyLeNangLuong, mucTieu, chamDiemNhanh, danhGiaChiTiet, goiYBoSung,
  phatChiPhi, heSoChiPhi, tienNguyenLieu,
  BoTinhMam, tinhNhanhMon, _dsGao, thongKeGanDay, dsTheoLoai, trongSoMon, _xepXenKe, taoUngVien, bocTham,
  KhoDuLieu, MayTuVan, taoId, tenMuiGio
};
if (typeof module !== "undefined" && module.exports) { module.exports = LOI_MAY; return; }

/* ================================================================================
   PHẦN CHẠY TRONG TRÌNH DUYỆT: lưu trữ, ảnh, trả lời /api/..., sự kiện thời gian thực
   ================================================================================ */
const MAU = goc.DU_LIEU_MAU || {nguyen_lieu: [], mon: [], anh: [], ghi_chu: "", ma: ""};
const DUONG_DAN = (goc.location.pathname || "/").replace(/index\.html?$/, "");
const KHOA_LUU = "hom-nay-an-gi:" + DUONG_DAN;
const TEN_IDB = "hom-nay-an-gi-anh:" + DUONG_DAN;
const cho = ms => new Promise(r => setTimeout(r, ms));

/* ---------- localStorage (có thể bị chặn ở chế độ ẩn danh: khi đó chỉ giữ trong bộ nhớ) ---------- */
const LUU_TRU = {
  duoc: true,
  doc() { try { const s = goc.localStorage.getItem(KHOA_LUU); return s ? JSON.parse(s) : null; } catch (e) { this.duoc = false; return null; } },
  ghi(kho) {
    try { goc.localStorage.setItem(KHOA_LUU, JSON.stringify(kho.trangThai())); this.duoc = true; }
    catch (e) {
      if (this.duoc) { this.duoc = false; phat("thong_bao", {noi_dung: "Trình duyệt không cho lưu dữ liệu (có thể đang ở chế độ ẩn danh hoặc bộ nhớ đầy). Dữ liệu sẽ mất khi đóng trang."}); }
    }
  },
  docMuc(k) { try { return goc.localStorage.getItem(KHOA_LUU + ":" + k); } catch (e) { return null; } },
  ghiMuc(k, v) { try { goc.localStorage.setItem(KHOA_LUU + ":" + k, v); } catch (e) { /* bỏ qua */ } }
};

/* ---------- IndexedDB cho ảnh món tải lên ---------- */
const IDB = {
  db: null,
  mo() {
    return new Promise(ok => {
      try {
        const r = goc.indexedDB.open(TEN_IDB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore("anh");
        r.onsuccess = () => { this.db = r.result; ok(true); };
        r.onerror = () => ok(false);
        r.onblocked = () => ok(false);
      } catch (e) { ok(false); }
    });
  },
  _giaoDich(che, lam) {
    return new Promise((ok, loi) => {
      if (!this.db) { ok(null); return; }
      try {
        const gd = this.db.transaction("anh", che), kho = gd.objectStore("anh");
        const kq = lam(kho);
        gd.oncomplete = () => ok(kq && kq.result !== undefined ? kq.result : null);
        gd.onerror = () => loi(gd.error);
        gd.onabort = () => loi(gd.error);
      } catch (e) { loi(e); }
    });
  },
  tatCa() {
    return new Promise(ok => {
      if (!this.db) { ok([]); return; }
      const kq = [];
      try {
        const r = this.db.transaction("anh", "readonly").objectStore("anh").openCursor();
        r.onsuccess = () => { const c = r.result; if (c) { kq.push([c.key, c.value]); c.continue(); } else ok(kq); };
        r.onerror = () => ok(kq);
      } catch (e) { ok(kq); }
    });
  },
  ghi(id, blob) { return this._giaoDich("readwrite", k => k.put(blob, id)); },
  xoa(id) { return this._giaoDich("readwrite", k => k.delete(id)); }
};

/* ---------- giọng đọc tên món: giọng mẫu (giong/mau/), giọng riêng xuất từ máy (giong/rieng/),
   giọng ghi âm trên bản trình diễn (IndexedDB). Giống giong_doc.py ---------- */
const GIONG_AO = {
  mau: MAU.giong || {mon: {}, cau: {}},
  kem: MAU.giong_rieng || {},            /* id -> {nguon: ghi_am | may_tao, chu, v} */
  taiLen: new Map(),                     /* id -> đường dẫn blob: của giọng ghi âm trên bản trình diễn */
  pb: new Map(),                         /* id -> số lần ghi âm (phiên bản) */
  chuDoc(ten) {
    return String(ten || "").replace(/\s*\([^)]*\)/g, "").replace(/\s*\/\s*/g, ", ").split(/\s+/).filter(Boolean).join(" ").replace(/^[\s,.]+|[\s,.]+$/g, "");
  },
  cauMon(kieu, ten) {
    let t = this.chuDoc(ten);
    const dau = t.split(" ")[0] || "";
    if (t && t[0] !== t[0].toLowerCase() && dau !== dau.toUpperCase()) t = t[0].toLowerCase() + t.slice(1);
    return {kq: "Hôm nay mình ăn " + t + " nha!", chot: "Chốt món " + t + " rồi nè!", doi: "Đổi qua món " + t + " nha."}[kieu];
  },
  kieuCau(loai) { return loai === "canh" || loai === "trang_mieng" ? ["doi"] : ["kq", "chot"]; },
  cau(k) { return (this.mau.cau || {})[k] != null ? "giong/mau/cau/" + k + ".wav" : null; },
  nguon(m) {
    if (!m) return {nguon: null, ds: {}, v: 0};
    if (this.taiLen.has(m.id)) return {nguon: "ghi_am", ds: {ten: this.taiLen.get(m.id)}, v: this.pb.get(m.id) || 1};
    const chu = this.chuDoc(m.ten), r = this.kem[m.id] || {}, can = this.kieuCau(m.loai), ds = {};
    if (r.nguon === "ghi_am") return {nguon: "ghi_am", ds: {ten: "giong/rieng/mon/" + m.id + "__ten.wav?v=" + (r.v || 1)}, v: r.v || 1};
    const mau = (this.mau.mon || {})[m.id] || {};
    if (mau.chu === chu) { can.forEach(k => { ds[k] = "giong/mau/mon/" + m.id + "__" + k + ".wav"; }); return {nguon: "mau", ds: ds, v: 0}; }
    if (r.nguon === "may_tao" && r.chu === chu) { can.forEach(k => { ds[k] = "giong/rieng/mon/" + m.id + "__" + k + ".wav?v=" + (r.v || 1); }); return {nguon: "may_tao", ds: ds, v: r.v || 1}; }
    return {nguon: null, ds: {}, v: 0};
  },
  tomTat(m) { const n = this.nguon(m); return {nguon: n.nguon, v: n.v}; },
  cauDoc(suKien, m, so) {
    const n = this.nguon(m), f = n.ds, ten = this.chuDoc(m.ten), coF = Object.keys(f).length > 0;
    const soF = so && this.cau("so_" + so) ? [this.cau("so_" + so)] : [];
    const soC = soF.length ? "Món số " + ["một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín", "mười", "mười một", "mười hai"][so - 1] + ". " : "";
    if (suKien === "thu") suKien = m.loai === "canh" || m.loai === "trang_mieng" ? "doi" : "kq";
    let ds = [], chu;
    if (suKien === "kq") { chu = soC + this.cauMon("kq", ten); if (coF) ds = soF.concat([f.ten || f.kq]); }
    else if (suKien === "chot") { chu = this.cauMon("chot", ten) + " Chúc mấy bạn ăn ngon miệng nha!"; if (coF) ds = (n.nguon === "ghi_am" ? [this.cau("da_chot"), f.ten] : [f.chot]).concat([this.cau("chuc")]); }
    else { chu = this.cauMon("doi", ten); if (coF) ds = n.nguon === "ghi_am" ? [this.cau("doi_sang"), f.ten] : [f.doi || f.kq]; }
    if (ds.some(x => !x)) ds = [];
    return {ds: ds, chu: chu, nguon: n.nguon};
  },
  thongTinMau() {
    const ten = String(this.mau.giong || "");
    return {ten: ten, vung: this.mau.vung || (/vais/i.test(ten) ? "bac" : (ten ? "nam" : ""))};
  },
  /* nhạc hiệu + lời chào theo buổi + giới thiệu robot + mời quay (giống KhoGiong.cau_mo_dau) */
  cauMoDau(buoi) {
    const cau = this.mau.cau || {}, ten = String(TEN_ROBOT || "Bin").trim();
    const laBin = !ten || ten.toLowerCase() === "bin";
    if (!(buoi in cau) || buoi.indexOf("chao") !== 0) buoi = "chao";
    const gt = laBin ? "gioi_thieu_bin" : "gioi_thieu";
    const ds = [buoi, gt, "moi_quay"].map(k => this.cau(k)).filter(Boolean);
    const chu = [cau[buoi] || "Xin chào mấy bạn!", laBin ? (cau.gioi_thieu_bin || "") : "Mình là rô-bốt " + ten + ", máy tư vấn dinh dưỡng nè.", cau.moi_quay || ""].join(" ").trim();
    return {nhac: this.cau("nhac_mo_dau"), ds: ds, chu: chu, chong: 1.5};
  },
  async luu(id, blob) {
    try { await IDB.ghi("giong:" + id, blob); } catch (e) { /* chỉ dùng trong phiên này */ }
    const cu = this.taiLen.get(id);
    this.taiLen.set(id, URL.createObjectURL(blob));
    this.pb.set(id, (this.pb.get(id) || ((this.kem[id] || {}).nguon === "ghi_am" ? this.kem[id].v || 1 : 0)) + 1);
    if (cu) setTimeout(() => URL.revokeObjectURL(cu), 15000);
  },
  xoa(id) {
    const u = this.taiLen.get(id);
    if (u) { this.taiLen.delete(id); setTimeout(() => URL.revokeObjectURL(u), 15000); }
    IDB.xoa("giong:" + id).catch(() => {});
    delete this.kem[id];
  }
};

/* ---------- ảnh món: ảnh tải lên, ảnh thật đi kèm bản xuất (thư mục anh/), ảnh minh họa vẽ bằng canvas ---------- */
const MAU_LOAI = {canh: [96, 160, 110], trang_mieng: [236, 170, 70]};
const FONT = '"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const ANH = {
  taiLen: new Map(),                     /* id -> đường dẫn blob: của ảnh đã tải lên */
  kemTheo: new Set(MAU.anh || []),       /* ảnh thật có sẵn trong thư mục anh/ */
  minhHoa: new Map(),                    /* id -> {khoa, url} */
  coAnhThat(id) { return this.taiLen.has(id) || (this.kemTheo.has(id) && !kho.anh_goc_tat.includes(id)); },
  url(id, v) {
    if (this.taiLen.has(id)) return this.taiLen.get(id);
    if (this.kemTheo.has(id) && !kho.anh_goc_tat.includes(id)) return "anh/" + encodeURIComponent(id) + ".jpg?v=" + (v || 0);
    const m = kho.mon.get(id) || {id: id, ten: "", loai: "", nhom_dam: ""};
    const khoa = [m.ten, m.loai, m.nhom_dam].join("|");
    const cu = this.minhHoa.get(id);
    if (cu && cu.khoa === khoa) return cu.url;
    const url = veAnhMinhHoa(m);
    this.minhHoa.set(id, {khoa: khoa, url: url});
    return url;
  },
  taoAnhTam(m) { this.minhHoa.delete(m.id); },
  xoaAnh(id) {
    const u = this.taiLen.get(id);
    if (u) { this.taiLen.delete(id); setTimeout(() => URL.revokeObjectURL(u), 15000); }
    IDB.xoa(id).catch(() => {});
    if (this.kemTheo.has(id) && !kho.anh_goc_tat.includes(id)) kho.anh_goc_tat.push(id);
    this.minhHoa.delete(id);
  },
  async xuLyAnhTaiLen(file, id) {
    const blob = await catAnh(file);
    try { await IDB.ghi(id, blob); } catch (e) { /* không lưu lâu dài được: vẫn dùng trong phiên này */ }
    const cu = this.taiLen.get(id);
    this.taiLen.set(id, URL.createObjectURL(blob));
    if (cu) setTimeout(() => URL.revokeObjectURL(cu), 15000);
    const i = kho.anh_goc_tat.indexOf(id);
    if (i >= 0) kho.anh_goc_tat.splice(i, 1);
    return Math.floor(Date.now() / 1000);
  }
};
/* Ảnh minh họa: nền theo nhóm món, đĩa sứ viền xanh, tên món (giống anh.py, vẽ ở 80% kích thước) */
function veAnhMinhHoa(mon) {
  const W = 800, H = 500, k = 0.8;
  const cv = document.createElement("canvas");
  cv.width = W * k; cv.height = H * k;
  const d = cv.getContext("2d");
  d.scale(k, k);
  const mau = MAU_LOAI[mon.loai] || mauNhom(mon.nhom_dam);
  const tron = t => "rgb(" + mau.map(c => Math.trunc(c * t + 255 * (1 - t))).join(",") + ")";
  const hinhTron = (x, y, r, to) => { d.beginPath(); d.arc(x, y, r, 0, Math.PI * 2); d.fillStyle = to; d.fill(); };
  d.fillStyle = tron(0.55); d.fillRect(0, 0, W, H);
  for (let y = 20; y < H; y += 40) for (let x = 20 + (Math.floor(y / 40) % 2) * 20; x < W; x += 40) hinhTron(x, y, 2, tron(0.7));
  const cx = W / 2, cy = H / 2, r = 200;
  hinhTron(cx, cy, r, "rgb(43,89,166)");
  hinhTron(cx, cy, r - 14, "rgb(250,251,248)");
  for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; hinhTron(cx + (r - 7) * Math.sin(a), cy - (r - 7) * Math.cos(a), 3, "rgb(250,251,248)"); }
  d.beginPath(); d.arc(cx, cy, r - 34, 0, Math.PI * 2); d.lineWidth = 3; d.strokeStyle = "rgb(200,214,236)"; d.stroke();
  d.font = "700 40px " + FONT; d.textAlign = "center"; d.textBaseline = "top"; d.fillStyle = "rgb(24,37,29)";
  const dong = [];
  let hien = "";
  String(mon.ten || "").split(/\s+/).filter(Boolean).forEach(t => {
    const thu = (hien + " " + t).trim();
    if (d.measureText(thu).width <= 2 * r - 90) hien = thu; else { if (hien) dong.push(hien); hien = t; }
  });
  if (hien) dong.push(hien);
  const ba = dong.slice(0, 3);
  let y = cy - 20 - Math.floor(ba.length * 50 / 2);
  ba.forEach(dg => { d.fillText(dg, cx, y); y += 50; });
  d.font = "700 16px " + FONT; d.fillStyle = "rgb(90,105,96)";
  d.fillText("Ảnh minh họa, hãy tải ảnh thật", cx, cy + 88);
  return cv.toDataURL("image/jpeg", 0.86);
}
/* Cắt giữa về tỉ lệ 16:10, 800×500 (giống xu_ly_anh_tai_len trong anh.py) */
async function catAnh(file) {
  let hinh, dong = null;
  try { hinh = await createImageBitmap(file, {imageOrientation: "from-image"}); dong = () => hinh.close && hinh.close(); }
  catch (e) {
    hinh = await new Promise((ok, loi) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(u); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(u); loi(new Error("file không phải ảnh")); };
      img.src = u;
    });
  }
  const w = hinh.width, h = hinh.height;
  if (!w || !h) throw new Error("ảnh rỗng");
  const W = 800, H = 500;
  let sw = w, sh = w * H / W;
  if (sh > h) { sh = h; sw = h * W / H; }
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(hinh, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, W, H);
  if (dong) dong();
  const blob = await new Promise(ok => cv.toBlob(ok, "image/jpeg", 0.85));
  if (!blob) throw new Error("trình duyệt không nén được ảnh");
  return blob;
}

/* ---------- sự kiện thời gian thực: thay cho EventSource("/api/su-kien") ---------- */
const NGUON = new Set();
function phat(loai, dl) {
  const chuoi = JSON.stringify(dl === undefined ? null : dl);
  NGUON.forEach(n => setTimeout(() => n._nhan(loai, chuoi), 0));
}
class NguonSuKienAo {
  constructor(url) {
    this.url = url; this.readyState = 0; this.withCredentials = false;
    this.onopen = null; this.onerror = null; this.onmessage = null; this._nghe = {};
    NGUON.add(this);
    sanSang.then(() => setTimeout(() => {
      if (this.readyState === 2) return;
      this.readyState = 1;
      if (this.onopen) this.onopen({type: "open"});
      ghiNhanKetNoi();
    }, 20));
  }
  addEventListener(loai, fn) { (this._nghe[loai] = this._nghe[loai] || []).push(fn); }
  removeEventListener(loai, fn) { const ds = this._nghe[loai] || []; const i = ds.indexOf(fn); if (i >= 0) ds.splice(i, 1); }
  close() { this.readyState = 2; NGUON.delete(this); }
  _nhan(loai, chuoi) {
    if (this.readyState !== 1) return;
    const e = {type: loai, data: chuoi, lastEventId: "", origin: goc.location.origin};
    (this._nghe[loai] || []).slice().forEach(fn => { try { fn.call(this, e); } catch (x) { console.error(x); } });
    if (loai === "message" && this.onmessage) this.onmessage(e);
  }
}
NguonSuKienAo.CONNECTING = 0; NguonSuKienAo.OPEN = 1; NguonSuKienAo.CLOSED = 2;
function ghiNhanKetNoi() {
  const kn = document.getElementById("ket-noi");
  if (kn && kn.lastChild) { kn.lastChild.textContent = "Bản trình diễn"; }
}

/* ---------- khởi tạo máy ảo ---------- */
const kho = new KhoDuLieu(MAU, k => LUU_TRU.ghi(k));
const may = new MayTuVan(kho, {
  bayGio: () => new Date(),
  dongHo: () => goc.performance.now(),
  hen: (fn, ms) => setTimeout(fn, ms),
  phat: phat,
  anh: ANH,
  diaChi: () => [{loai: "Trang web", url: goc.location.origin + DUONG_DAN}]
});
function napThongTinMau() {         /* tên đơn vị, người thực hiện, số suất, định mức tiền ăn đi kèm bản xuất từ máy thật */
  const tt = MAU.thong_tin || {};
  THONG_TIN.forEach(([k, dai]) => { const v = gonChu(tt[k], dai); if (v) kho.cai_dat[k] = v; });
  const cd = MAU.cai_dat || {}, gioiHan = {so_nguoi_di_cho: [1, 5000], dinh_muc_suat: [0, 1000000], chi_phi_khac_suat: [0, 200000], uu_tien_chi_phi: [0, 2]};
  Object.keys(gioiHan).forEach(k => {
    const v = Number(cd[k]);
    if (coKhoa(cd, k) && Number.isInteger(v) && v >= gioiHan[k][0] && v <= gioiHan[k][1]) kho.cai_dat[k] = v;
  });
}
function napDuLieu() {
  const s = LUU_TRU.doc();
  if (!s) { kho.napThuVienMau(); napThongTinMau(); return; }
  kho.napTuTrangThai(s);
  /* giáo viên xuất lại trang với thư viện mới: cập nhật cho người chưa tự sửa thư viện */
  if (MAU.ma && kho.ma_mau !== MAU.ma && !kho.da_sua_thu_vien) {
    kho.napThuVienMau();
    napThongTinMau();
    if (!(kho.phien || {}).chot) kho.phien = Object.assign({}, kho.phien || {}, {ngay: null});
  }
}
async function napAnhDaTai() {
  if (!(await IDB.mo())) return;
  (await IDB.tatCa()).forEach(kv => {
    if (!kv[1]) return;
    if (String(kv[0]).indexOf("giong:") === 0) GIONG_AO.taiLen.set(String(kv[0]).slice(6), URL.createObjectURL(kv[1]));
    else ANH.taiLen.set(kv[0], URL.createObjectURL(kv[1]));
  });
}
async function taiPhongChu() {
  if (!document.fonts || !document.fonts.load) return;
  await document.fonts.load('700 40px "Be Vietnam Pro"', "Ảnh");
}
const sanSang = (async () => {
  try { napDuLieu(); }
  catch (e) { console.error("Dữ liệu đã lưu bị hỏng, dùng lại thư viện mẫu:", e); kho.napThuVienMau(); kho.lich_su = []; kho.phien = null; }
  await Promise.race([Promise.all([napAnhDaTai().catch(() => {}), taiPhongChu().catch(() => {})]), cho(3000)]);
  try { may.khoiDong(); } catch (e) { console.error(e); kho.phien = null; may.damBaoPhien(); }
  setInterval(() => { try { may.damBaoPhien(); } catch (e) { console.error(e); } }, 20000);
})();
/* mở trang ở hai tab: tab kia đổi dữ liệu thì nạp lại */
goc.addEventListener("storage", e => {
  if (e.key !== KHOA_LUU || !e.newValue || may.dangQuayThat()) return;
  try { kho.napTuTrangThai(JSON.parse(e.newValue)); } catch (x) { return; }
  phat("cap_nhat", {ly_do: "khoi_phuc"});
});

/* ---------- trả lời các lệnh /api/... (giống may_chu_web.py) ---------- */
function traLoi(ma, noiDung) {
  return new Response(JSON.stringify(noiDung), {status: ma, headers: {"Content-Type": "application/json; charset=utf-8"}});
}
function docHeader(h, ten) {
  if (!h) return "";
  if (typeof h.get === "function") return h.get(ten) || "";
  const k = Object.keys(h).find(x => x.toLowerCase() === ten.toLowerCase());
  return k ? h[k] : "";
}
async function xuLyApi(url, init) {
  await sanSang;
  const u = new URL(url, goc.location.href), duong = u.pathname, pp = (init.method || "GET").toUpperCase();
  let than = {};
  const body = init.body;
  if (typeof body === "string") { try { than = JSON.parse(body) || {}; } catch (e) { than = {}; } }
  const ma = docHeader(init.headers, "X-Ma-Quan-Tri") || u.searchParams.get("ma") || "";
  const ok = kq => traLoi(200, Object.assign({ok: true}, kq || {}));
  const canQuanTri = () => {
    const dung = kho.cai_dat.ma_quan_tri || "";
    if (dung && ma !== dung) throw new CanMaQuanTri("Cần mã quản trị để thực hiện thao tác này");
  };
  const tach = duong.match(/^\/api\/mon\/([^/]+)(?:\/(bat|tim|anh|giong|doc))?$/);
  const tachNl = duong.match(/^\/api\/nguyen-lieu\/([^/]+)$/);
  try {
    if (duong === "/api/dong-ho") return traLoi(200, {t: goc.performance.now()});
    if (duong === "/api/trang-thai") { may.damBaoPhien(); return ok(may.trangThai()); }
    if (duong === "/api/quay" && pp === "POST") return ok({quay: may.yeuCauQuay("web")});
    if (duong === "/api/chot" && pp === "POST") return ok({ket_qua: may.chot("web")});
    if (duong === "/api/huy-chot" && pp === "POST") { canQuanTri(); may.huyChot(); return ok(); }
    if (duong === "/api/chon-tay" && pp === "POST") { canQuanTri(); return ok({ket_qua: may.chonTay(than.idx == null ? -1 : than.idx)}); }
    if (duong === "/api/doi-kem" && pp === "POST") return ok({ket_qua: may.doiKem(than.loai, "web", than.chon ? String(than.chon) : null)});
    if (duong === "/api/nut" && pp === "POST") return ok({thuc_hien: may.bamNut(String(than.nut || ""), "web_phim")});
    if (duong === "/api/lam-moi-ung-vien" && pp === "POST") { canQuanTri(); may.lamMoiUngVien(); return ok(); }
    if (duong === "/api/mon" && pp === "GET") return ok({ds: may.dsMon().map(m => Object.assign(m, {giong: GIONG_AO.tomTat(m)}))});
    if (duong === "/api/giong/doc" && pp === "GET") {
      const m = kho.mon.get(u.searchParams.get("id") || "");
      if (!m) throw new LoiNghiepVu("Không tìm thấy món");
      const so = parseInt(u.searchParams.get("so"), 10);
      return ok(GIONG_AO.cauDoc(u.searchParams.get("su_kien") || "thu", m, so >= 1 && so <= 12 ? so : null));
    }
    if (duong === "/api/thu-loa" && pp === "POST") return ok({loa: null});
    if (duong === "/api/mo-dau" && pp === "POST") { may.moDau(); return ok({loa: null}); }
    if (duong.indexOf("/api/ai/") === 0) return traLoi(409, {ok: false, ma: "may_ao", loi: "Bản trình diễn hỏi Gemini trực tiếp từ trình duyệt: nhập khóa trong Cài đặt, Trợ lý AI."});
    if (duong === "/api/giong/mo-dau" && pp === "GET") return ok(GIONG_AO.cauMoDau(may.buoiChao()));
    if (duong === "/api/ket-noi" && pp === "GET") {        /* bản trình diễn: mã QR mở chính trang này */
      const url = goc.location.href.split("#")[0];
      return ok({ds: [{loai: "Bản trình diễn", kieu: "web", url: url}], diem_phat: null, wifi: {}, dang_diem_phat: false, url_diem_phat: null, url_usb: null});
    }
    if (duong === "/api/mon" && pp === "POST") { canQuanTri(); return ok({mon: may.luuMon(than)}); }
    if (tach) {
      const mid = decodeURIComponent(tach[1]), phu = tach[2];
      if (!phu && pp === "DELETE") { canQuanTri(); may.xoaMon(mid); return ok(); }
      if (phu === "bat" && pp === "POST") { canQuanTri(); may.batTatMon(mid, than.bat === undefined ? true : than.bat); return ok(); }
      if (phu === "tim" && pp === "POST") return ok({tim: may.thaTim(mid)});
      if (phu === "anh" && pp === "POST") {
        canQuanTri();
        const f = body && typeof body.get === "function" ? body.get("anh") : null;
        if (!f) throw new LoiNghiepVu("Chưa chọn ảnh");
        if (f.size > 12 * 1024 * 1024) return traLoi(413, {ok: false, loi: "File quá lớn (tối đa 12 MB)"});
        return ok({anh_v: await may.luuAnhMon(mid, f)});
      }
      if (phu === "anh" && pp === "DELETE") { canQuanTri(); may.xoaAnhMon(mid); return ok(); }
      if (phu === "giong" || phu === "doc") {
        const m = kho.mon.get(mid);
        if (!m) throw new LoiNghiepVu("Không tìm thấy món");
        if (phu === "doc") return ok({loa: null});             /* bản trình diễn không có loa của máy */
        canQuanTri();
        if (pp === "POST") {
          const f = body && typeof body.get === "function" ? body.get("giong") : null;
          if (!f) throw new LoiNghiepVu("Chưa có file ghi âm");
          if (f.size > 3 * 1024 * 1024) throw new LoiNghiepVu("File ghi âm quá lớn");
          await GIONG_AO.luu(mid, f);
        } else if (pp === "DELETE") GIONG_AO.xoa(mid);
        may.phat("giong_moi", {id: mid});
        return ok({giong: GIONG_AO.tomTat(m)});
      }
    }
    if (duong === "/api/nguyen-lieu" && pp === "GET") return ok({ds: Array.from(kho.nguyen_lieu.values()), ghi_chu: kho.ghi_chu_nguon, gia_ghi_chu: kho.ghi_chu_gia});
    if (duong === "/api/gia" && pp === "POST") { canQuanTri(); return ok({so_doi: may.capNhatGia(than.ds)}); }
    if (duong === "/api/nguyen-lieu" && pp === "POST") { canQuanTri(); return ok({nguyen_lieu: may.luuNguyenLieu(than)}); }
    if (tachNl && pp === "DELETE") { canQuanTri(); may.xoaNguyenLieu(decodeURIComponent(tachNl[1])); return ok(); }
    if (duong === "/api/lich-su" && pp === "GET") return ok(may.lichSu());
    if (duong === "/api/lich-su" && pp === "DELETE") { canQuanTri(); may.xoaLichSu(); return ok(); }
    if (duong === "/api/cai-dat" && pp === "GET") return ok(may.caiDatCongKhai());
    if (duong === "/api/cai-dat" && pp === "POST") { canQuanTri(); return ok(may.capNhatCaiDat(than)); }
    if (duong === "/api/kiem-tra-ma" && pp === "POST") {
      if (may.kiemTraMa(String(than.ma == null ? "" : than.ma))) return ok();
      return traLoi(403, {ok: false, loi: "Mã quản trị chưa đúng"});
    }
    if (duong === "/api/dong-bo-gio" && pp === "POST") {
      const doi = may.dongBoGio(than.epoch_ms, than.mui_gio_phut, than.mui_gio_ten);
      return ok(Object.assign({da_doi: doi}, may.thongTinGio()));
    }
    if (duong === "/api/thu-led" && pp === "POST") { canQuanTri(); may.thuLed(); return ok(); }
    if (duong === "/api/khoi-phuc" && pp === "POST") {
      canQuanTri();
      const f = body && typeof body.get === "function" ? body.get("file") : null;
      let dl;
      try { dl = f ? JSON.parse(await f.text()) : than; }
      catch (e) { throw new LoiNghiepVu("Không khôi phục được: file không đúng định dạng JSON"); }
      may.khoiPhuc(dl);
      return ok();
    }
    if (duong === "/api/khoi-phuc-mau" && pp === "POST") { canQuanTri(); may.khoiPhucMau(); return ok(); }
    return traLoi(404, {ok: false, loi: "Bản trình diễn không có chức năng này (" + duong + ")"});
  } catch (e) {
    if (e instanceof CanMaQuanTri) return traLoi(403, {ok: false, loi: e.message, can_ma: true});
    if (e instanceof LoiNghiepVu) return traLoi(400, {ok: false, loi: e.message});
    console.error(e);
    return traLoi(500, {ok: false, loi: "Lỗi trong bản trình diễn: " + (e && e.message ? e.message : e)});
  }
}

/* ---------- tải bản sao lưu (thay cho đường dẫn /api/sao-luu) ---------- */
function taiSaoLuu() {
  const b = may.bayGio();
  const ten = "sao-luu-dinh-duong-" + b.nam + p2(b.thang) + p2(b.ngay) + "-" + p2(b.gio) + p2(b.phut) + ".json";
  const blob = new Blob([JSON.stringify(kho.xuatTatCa(), null, 1)], {type: "application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = ten;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/* ---------- gắn vào trang ---------- */
const fetchGoc = goc.fetch ? goc.fetch.bind(goc) : null;
goc.fetch = function (input, init) {
  const url = typeof input === "string" ? input : (input && input.url) || String(input);
  if (/^\/api\//.test(url)) return xuLyApi(url, init || {});
  return fetchGoc(input, init);
};
const EventSourceGoc = goc.EventSource;
goc.EventSource = function (url, tuyChon) {
  if (String(url).indexOf("/api/su-kien") >= 0) return new NguonSuKienAo(url);
  return new EventSourceGoc(url, tuyChon);
};

/* thông báo nhỏ đầu trang: đây là bản trình diễn */
(function hienThongBao() {
  if (LUU_TRU.docMuc("an-thong-bao") === "1") return;
  const main = document.querySelector("main");
  if (!main) return;
  const kieu = document.createElement("style");
  kieu.textContent =
    ".bia-demo{display:flex;gap:10px;align-items:flex-start;background:var(--su-nhat);color:#1d3f78;border:1px solid #c9d6ee;" +
    "border-radius:var(--r);padding:10px 14px;margin:0 0 18px;font-size:14px;line-height:1.5}" +
    ".bia-demo p{margin:0;flex:1}.bia-demo button{flex:none;border:0;background:none;color:inherit;font-size:20px;line-height:1;cursor:pointer;padding:0 4px}" +
    "body.trinh-chieu .bia-demo{display:none}";
  document.head.appendChild(kieu);
  const bia = document.createElement("div");
  bia.className = "bia-demo"; bia.setAttribute("role", "note");
  bia.innerHTML = "<p><b>Bản trình diễn trên web.</b> Vòng quay, ghép mâm và chấm điểm chạy ngay trên trình duyệt; " +
    "dữ liệu chỉ lưu trên thiết bị này. Máy thật UniHiker M10 có thêm màn hình, vòng 12 đèn LED, còi và đồng bộ nhiều điện thoại cùng lúc.</p>" +
    '<button type="button" aria-label="Ẩn thông báo">×</button>';
  bia.querySelector("button").onclick = () => { bia.remove(); LUU_TRU.ghiMuc("an-thong-bao", "1"); };
  main.insertBefore(bia, main.firstChild);
})();

goc.MAY_AO = {
  anhUrl: (id, v) => ANH.url(id, v),
  taiSaoLuu: taiSaoLuu,
  may: may, kho: kho, sanSang: sanSang,
  /* xóa sạch dữ liệu trình diễn trên thiết bị này (gõ MAY_AO.datLai() trong Console) */
  datLai: async () => {
    try { goc.localStorage.removeItem(KHOA_LUU); } catch (e) { /* bỏ qua */ }
    try { goc.indexedDB.deleteDatabase(TEN_IDB); } catch (e) { /* bỏ qua */ }
    goc.location.reload();
  }
};
})(typeof window !== "undefined" ? window : globalThis);
