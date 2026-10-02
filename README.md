# Hôm nay ăn gì? – Máy tư vấn dinh dưỡng học đường

Bản trình diễn trên web của dự án STEM **Máy tư vấn dinh dưỡng học đường** (UniHiker M10, vòng LED 12 bóng, webapp).

- Vòng quay chọn món chính **ngẫu nhiên có trọng số**: ưu tiên cá, đạm thực vật khi tuần này còn thiếu, hạn chế món chiên, không lặp món trong 14 ngày.
- Tự ghép **canh, cơm, tráng miệng** và tính khẩu phần theo lứa tuổi.
- Chấm **điểm cân đối 0–100** theo năng lượng, tỉ lệ đạm – béo – bột đường, rau, muối và vi chất.
- Có thư viện món, bảng nguyên liệu, lịch sử bữa ăn, danh sách đi chợ, chế độ trình chiếu.
- Robot trợ lý **Bin** nhận xét mâm cơm và nhắc từng bước; phím 1, 2, 3, 4 thay cho 4 nút Quay, Chốt, Đổi canh, Đổi tráng miệng trên máy thật.

Mọi tính toán chạy ngay trên trình duyệt; dữ liệu của mỗi người lưu trên chính thiết bị của họ.
Số liệu dinh dưỡng là ước tính để tham khảo, không thay cho tư vấn của chuyên gia dinh dưỡng.

## Các file

| File | Vai trò |
|---|---|
| `index.html` | Giao diện webapp (giống hệt bản chạy trên UniHiker M10) |
| `may_ao.js` | "Máy ảo": thuật toán chọn món, ghép mâm, chấm điểm chạy trên trình duyệt |
| `du_lieu_mau.js` | Thư viện món và bảng nguyên liệu |
| `mat_so.html` | Mặt số vòng quay khổ A4 để in, đặt lên vòng LED của máy thật |
| `phieu.html`, `xlsx_nho.js` | Phiếu thực đơn, định lượng, kê chợ khổ A4 và công cụ tạo file Excel ngay trên trình duyệt |
| `qrcode.js` | Tạo mã QR (thư viện qrcode-generator, giấy phép MIT) |
| `phong_chu/` | Phông chữ Be Vietnam Pro (giấy phép SIL OFL) |
| `anh/` | Ảnh thật của món ăn (nếu có) |

Tạo lại bộ file này bằng `xuat_trang_github.py` trong thư mục dự án, hoặc nút "Tải bản trình diễn cho GitHub" trong phần Cài đặt của webapp trên máy.
