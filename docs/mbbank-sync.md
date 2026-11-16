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

Trang lịch, giao dịch, số dư ví và thống kê nhận cập nhật trực tiếp qua `GET /api/realtime/events` (SSE, có xác thực cookie). Máy chủ theo dõi các giao dịch MB Bank vừa commit bằng MongoDB Change Streams, nên vẫn nhận được giao dịch do function webhook Vercel khác ghi vào. Không cần reload trang. Kết nối tự mở lại định kỳ để phù hợp giới hạn serverless; mỗi lần nối lại sẽ tải bù dữ liệu. Nếu kết nối trực tiếp gián đoạn, web vẫn kiểm tra mỗi 10 giây và khi quay về từ app ngân hàng. Độ trễ của ngân hàng/nhà cung cấp trước khi gửi webhook nằm ngoài CapMoney.

## Thông báo MB Bank trên thiết bị

1. Chạy `npm run push:keys` một lần để tạo `VAPID_PUBLIC_KEY` và `VAPID_PRIVATE_KEY`. Giữ khóa riêng ngoài Git; không đặt vào biến `VITE_*`. Giữ nguyên bộ khóa giữa các lần deploy.
2. Đặt hai biến đó cùng `VAPID_SUBJECT=mailto:<email-lien-he-cua-ban>` trên **cả API web lẫn các function webhook MB Bank/SePay**. Dùng cùng bộ khóa cho mọi deployment cùng database. Khi chạy local, cấu hình trong `.env` gốc cho `npm run dev`, hoặc `backend/.env` cho `npm run dev:backend`.
3. Triển khai lại frontend và backend. Website phải dùng HTTPS (localhost được hỗ trợ khi phát triển). MongoDB phải là replica set/Atlas như yêu cầu sẵn có của webhook. Vercel đã được cấu hình thời gian chạy 60 giây; SSE luân phiên kết nối sau 25 giây. Reverse proxy riêng cần tắt buffering cho `/api/realtime/events`.
4. Trên từng thiết bị, đăng nhập rồi vào **Cá nhân → Thông báo → Thông báo tiền vào và tiền ra MB Bank** và cho phép trình duyệt gửi thông báo. Với iPhone/iPad, cần iOS/iPadOS 16.4 trở lên: mở CapMoney bằng Safari trên HTTPS, chọn **Chia sẻ → Thêm vào Màn hình chính**, sau đó mở CapMoney từ biểu tượng ứng dụng rồi bật Web Push. Safari iOS đang mở như một tab web không nhận Web Push.

Sau khi bật, dùng nút **Gửi thử thông báo trên thiết bị này** ngay bên dưới. Nếu thông báo thử không đến, hãy kiểm tra `GET /api/notifications/config` có trả `enabled: true` hay không, rồi kiểm tra quyền **Notifications → CapMoney** trên iPhone. Nút thử cũng báo khi subscription đã hết hạn để bạn tắt/bật lại đăng ký.

Sau khi webhook commit thành công, máy chủ gửi Web Push đến những thiết bị đã bật của đúng tài khoản; service worker hiển thị tiền vào/tiền ra và số tiền kể cả khi trang đã đóng. Bấm thông báo để mở trang Ví. Khi đang mở web còn có thông báo trong ứng dụng, không phụ thuộc quyền thông báo hệ thống. Webhook gửi lại cùng mã tham chiếu không gửi thông báo lần nữa. Tắt thông báo hoặc đăng xuất sẽ hủy đăng ký trên thiết bị hiện tại; endpoint hết hạn được máy chủ dọn khi push trả 404/410.

Nếu chưa có cấu hình VAPID, cập nhật trực tiếp và thông báo trong web vẫn chạy, còn nút bật thông báo thiết bị sẽ giải thích cấu hình thiếu. Web Push phụ thuộc kết nối mạng, quyền trình duyệt và cài đặt thông báo của hệ điều hành. Lỗi gửi push được ghi nhận nhưng không làm mất hoặc ghi lại giao dịch ngân hàng; hiện chưa có hàng đợi gửi lại push khi dịch vụ push lỗi tạm thời. Luồng webhook ntfy cũ (không có `MONGO_URI`) chưa hỗ trợ thông báo và SSE này; cần chuyển về MongoDB dùng chung như hướng dẫn ở trên.

Tài liệu kỹ thuật: [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [giới hạn thời gian Vercel Functions](https://vercel.com/docs/functions/configuring-functions/duration).

Đồng bộ bản sao không yêu cầu hai thiết bị mở cùng lúc. Trên điện thoại, đăng nhập và tạo bản sao từ nguồn “Dữ liệu lưu trên thiết bị này”; sau đó có thể đóng điện thoại. Khi thuận tiện, đăng nhập cùng tài khoản trên máy tính, chọn bản sao đó và khôi phục. Máy chủ giữ bản sao cho đến khi máy tính áp dụng.

Trước khi dùng chính thức, thử một khoản tiền ra nhỏ và kiểm tra cả lịch sử webhook của nhà cung cấp lẫn trang giao dịch. “Gửi thử” thành công chỉ chứng minh endpoint nhận được payload, chưa chứng minh MB Bank gửi tiền ra của tài khoản thật.
