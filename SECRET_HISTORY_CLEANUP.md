# Secret History Cleanup

Secret penting memang pernah masuk git history repo ini. Karena itu, langkah aman terdiri dari dua bagian:

## 1. Rotate Secret Sekarang

Minimal rotate semua secret ini sebelum atau bersamaan dengan rewrite history:

- `DATABASE_URL`
- `JWT_SECRET`
- `EMAIL_PASS`
- `MIDTRANS_SERVER_KEY`
- `PASSWORD_SALT`
- `ADMIN_PASSWORD_HASH`

Jika secret lama masih aktif, menghapus history saja belum cukup.

## 2. Secret Yang Terdeteksi Pernah Masuk History

Beberapa pencarian lokal yang sudah terdeteksi:

- Email sender / app password:
  - commit `de02e48`
  - commit `4451315`
  - commit `64764bf`
  - commit `a3137e4`
  - commit `c7d6294`
- Database URL:
  - commit `52c67e1`
  - commit `b9636c5`
  - commit `f20fca3`
  - commit `22197c5`
  - commit `942acd4`
  - commit `c7d6294`
  - commit `a3137e4`
  - commit `64764bf`
  - commit `afff23c`
- Midtrans server key:
  - commit `75e92cd`
  - commit `31235ef`
  - commit `332f897`
  - commit `4a13536`
  - commit `dfaba56`
  - commit `263b4cc`
  - commit `d14d533`
  - commit `bf3e989`
  - commit `fd3963c`
- JWT fallback secret:
  - commit `de02e48`
  - commit `4451315`
- Password salt / admin auth material:
  - banyak commit, termasuk `26b73e7`, `1096e48`, `4ea702a`, `fd3963c`

## 3. Recommended Cleanup Method

Tool terbaik biasanya `git filter-repo`, tapi tool itu belum tersedia di mesin ini saat dicek.

Kalau ingin membersihkan history dengan aman:

1. Install `git-filter-repo`
2. Buat mirror clone baru
3. Rewrite history di clone mirror
4. Force push hasil rewrite ke GitHub
5. Revoke semua clone lama / minta collaborator re-clone

## 4. Safe Rewrite Workflow

Jalankan dari folder terpisah, jangan dari working tree utama yang masih dipakai aktif:

```powershell
git clone --mirror https://github.com/<username>/<repo>.git repo-clean.git
cd repo-clean.git
```

Lalu hapus atau replace secret dengan `git filter-repo --replace-text`.

Contoh file `replacements.txt`:

```text
literal:postgresql://OLD_CONNECTION_STRING==>postgresql://REDACTED
literal:OLD_EMAIL_PASSWORD==>REDACTED_EMAIL_PASS
literal:OLD_JWT_SECRET==>REDACTED_JWT_SECRET
literal:OLD_MIDTRANS_SERVER_KEY==>REDACTED_MIDTRANS_KEY
```

Lalu jalankan:

```powershell
git filter-repo --replace-text replacements.txt
git push --force --mirror origin
```

## 5. After Rewrite

Setelah force push:

- hapus semua deployment secret lama yang sudah bocor
- update secret baru di Vercel
- minta semua collaborator melakukan clone ulang
- anggap commit hash lama sudah tidak berlaku lagi

## 6. Important Note

Karena history rewrite mengubah seluruh commit graph, langkah ini sebaiknya dilakukan setelah semua perubahan kerja saat ini aman atau sudah dicadangkan.
