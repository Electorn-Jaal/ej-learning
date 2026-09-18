
Бусад хэрэгтэй команд

corepack pnpm install          # шинэ clone дээр, эсвэл package нэмсэн бол
corepack pnpm typecheck        # бүх багцыг шалгах
corepack pnpm build            # production build

corepack pnpm --filter @workspace/db run migrate      # DB шинэчлэх
corepack pnpm --filter @workspace/api-spec run codegen # API гэрээнээс код үүсгэх

corepack pnpm dev
Одоо сервер асаалттай байна — унтраах шаардлагагүй бол тэр чигээр нь үлдээж болно.