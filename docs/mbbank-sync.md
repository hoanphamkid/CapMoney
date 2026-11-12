# Tự động ghi nhận giao dịch MB Bank

Luồng dữ liệu: MB Bank → dịch vụ nhận biến động số dư → POST webhook → MongoDB của CapMoney → trang giao dịch. Web chỉ tự ghi được khi dịch vụ thực sự gửi thông báo cho giao dịch đó.

## Chọn kết nối có hỗ trợ tiền ra

Mục tiêu ghi nhận các khoản **bạn thanh toán/chuyển đi** cần dữ liệu tiền ra, không chỉ thông báo nhận thanh toán.

Tài liệu SePay hiện chưa thống nhất: [hướng dẫn MB Bank](https://docs.sepay.vn/ket-noi-mb-api.html) nói nhận báo có/báo nợ ở tài khoản chính, nhưng [hướng dẫn tạo webhook](https://developer.sepay.vn/vi/sepay-webhooks/tao-webhook) giới hạn webhook tiền ra ở Sacombank, TPBank và VietinBank với TKP. Cần xác nhận khả năng gửi webhook tiền ra của kết nối MB thực tế với SePay; không thể bảo đảm bằng cách chỉ chọn sự kiện “Cả hai”. Nếu chỉ nhận tiền vào, endpoint này không thể tự suy ra khoản thanh toán đi.

Nếu dùng Casso hoặc bộ chuyển tiếp thông báo/SMS, cần kiểm tra dịch vụ đó thực sự hỗ trợ tiền ra MB Bank và gửi đủ mã tham chiếu, số tài khoản, số tiền, chiều giao dịch, ngày giờ. Đăng nhập/ngân hàng và xác thực liên kết được thực hiện trực tiếp với nhà cung cấp, không gửi mật khẩu hay OTP cho CapMoney.

## Cấu hình CapMoney

1. Chạy backend Express có MongoDB replica set/Atlas và đăng nhập tài khoản trên **backend**, không chỉ tạo tài khoản lưu trong trình duyệt. Lấy `user.id` từ `GET /api/auth/me` của phiên đăng nhập này.
2. Thiết lập biến môi trường **máy chủ**:

   ```dotenv
   MBBANK_WEBHOOK_SECRET=<khóa ngẫu nhiên riêng>
   MBBANK_USER_EMAIL=hoan@gmail.com
   # Hoặc dùng MBBANK_USER_ID nếu muốn khóa theo ObjectId nội bộ.
   MBBANK_USER_ID=
   MBBANK_ACCOUNT_NUMBER=<số tài khoản MB được liên kết>
   ```

   Có thể tạo khóa bằng `node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"`. `SEPAY_WEBHOOK_SECRET` là tên thay thế và có ưu tiên nếu được đặt. Không dùng khóa mẫu hay đưa khóa vào biến `VITE_*`.
3. Khởi động lại backend để áp dụng. Với Vercel, đặt thêm `MONGO_URI` và dùng **cùng database** với backend web. Frontend phải gọi backend đó qua `VITE_API_URL` (URL có hậu tố `/api`) hoặc reverse proxy `/api`; `CLIENT_URL` trên backend phải khớp origin của frontend và phiên cookie phải hoạt động.
4. Trong nhà cung cấp, đặt URL webhook công khai HTTPS: `https://<backend-cua-ban>/api/webhooks/sepay` hoặc `/api/webhooks/mbbank`. Không dùng localhost nếu nhà cung cấp không truy cập được. Chọn đúng số tài khoản và bật gửi lại khi lỗi.
5. Với SePay, chọn xác thực API Key, điền cùng khóa. Header gửi tới CapMoney là `Authorization: Apikey <khóa>`. Với bộ chuyển tiếp riêng có thể dùng Bearer hoặc `x-api-key`; không truyền khóa trên URL. Chỉ bật tiền ra/cả hai khi kết nối ngân hàng thực tế hỗ trợ. Không yêu cầu mã đơn hàng nếu muốn ghi nhận toàn bộ chi tiêu cá nhân.

Webhook được gắn cố định với một người dùng và một số tài khoản trong cấu hình máy chủ; `userId` hoặc `email` trong payload/URL không thay đổi chủ sở hữu. Tích hợp nhiều người dùng cần bổ sung liên kết riêng cho từng tài khoản. Có thể cấu hình bằng email (`MBBANK_USER_EMAIL`) hoặc ObjectId (`MBBANK_USER_ID`); ObjectId được ưu tiên nếu cả hai cùng có.

## Hai thư mục triển khai Vercel

- Deploy từ gốc repository: `api/webhooks/mbbank.ts` lưu vào MongoDB.
- Deploy từ `frontend/`: `frontend/api/webhooks/mbbank.ts` dùng cùng handler MongoDB **khi có `MONGO_URI`**. Không đặt biến này thì bản cũ vẫn lưu snapshot qua ntfy, không đồng bộ vào dữ liệu backend hiện tại. Mã ntfy được giữ để không ghi đè thay đổi đang có; cần chuyển cấu hình sang MongoDB để dùng luồng này.

Vercel cần triển khai cả function `api/[...path].ts` để chạy API đăng nhập, giao dịch và bản sao trên cùng MongoDB. Khi đó `https://<tên-miền>/api/auth/me` phải trả `401` khi chưa đăng nhập (không phải `404`). `CLIENT_URL` trên Vercel phải là origin frontend, ví dụ `https://cap-money.vercel.app`. Không tự chuyển dữ liệu ntfy hoặc dữ liệu trình duyệt cũ sang MongoDB. Dùng chức năng bản sao của web để chuyển dữ liệu thiết bị nếu cần.

## Kiểm tra giao dịch

Payload mẫu (chỉ dùng trong database thử nghiệm; gửi mẫu hợp lệ sẽ tạo giao dịch):

```json
{
  "id": 123456,
  "gateway": "MBBank",
  "accountNumber": "<số tài khoản đã cấu hình>",
  "transferType": "out",
  "transferAmount": 50000,
  "content": "Thanh toán cơm trưa",
  "transactionDate": "2026-11-12 12:30:00",
  "referenceCode": "MB-TEST-123456"
}
```

Thành công trả HTTP 200 và `success: true`. Gửi lại cùng tài khoản/mã tham chiếu không tạo khoản mới. Tiền ra tạo `expense` và giảm số dư ví **MB Bank**; tiền vào tạo `income` và tăng số dư. Các ví ngân hàng khác không bị sử dụng thay thế. Số dư ví là số dư ban đầu bạn nhập cộng/trừ các giao dịch đã nhận, không phải số dư tuyệt đối lấy từ ngân hàng.

Ngày giờ không có timezone được hiểu là giờ Việt Nam. Casso gửi nhiều phần tử trong `data` được xử lý toàn bộ trong một transaction database. Thiếu khóa, thiếu cấu hình tài khoản, số tiền sai, thiếu mã tham chiếu hoặc lưu thất bại đều trả lỗi để không báo thành công giả.

Trang lịch, giao dịch và thống kê tải dữ liệu mới mỗi 10 giây khi đang hiển thị, đồng thời tải lại khi bạn quay về từ app ngân hàng. Khoảng này tính từ lúc webhook đã lưu thành công; độ trễ của ngân hàng/nhà cung cấp nằm ngoài CapMoney.

Đồng bộ bản sao không yêu cầu hai thiết bị mở cùng lúc. Trên điện thoại, đăng nhập và tạo bản sao từ nguồn “Dữ liệu lưu trên thiết bị này”; sau đó có thể đóng điện thoại. Khi thuận tiện, đăng nhập cùng tài khoản trên máy tính, chọn bản sao đó và khôi phục. Máy chủ giữ bản sao cho đến khi máy tính áp dụng.

Trước khi dùng chính thức, thử một khoản tiền ra nhỏ và kiểm tra cả lịch sử webhook của nhà cung cấp lẫn trang giao dịch. “Gửi thử” thành công chỉ chứng minh endpoint nhận được payload, chưa chứng minh MB Bank gửi tiền ra của tài khoản thật.
