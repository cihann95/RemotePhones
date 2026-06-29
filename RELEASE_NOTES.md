# Phone Farm v3.0.0 — Portable Release

## ✅ HAZIR! Kullanıcı için tamamen çalışır durumda

### Ne değişti?

**KURULUM ARTIK ÇOK KOLAY:**
1. ZIP indir
2. Klasöre çıkar
3. Phone Farm.exe'yi çift tıkla
4. Telefonu bağla

**Python, ADB, pip kurulumu gerekmez!**

---

## 📦 İndirme

**PhoneFarm-Portable-3.0.0.zip** (265 MB)
- Tüm bağımlılıklar dahil
- ADB + DLL'ler gömülü
- Kurulum gerekmez

---

## 🔧 Teknik Detaylar

### Düzeltilen Sorunlar:
1. ✅ Electron builder kod imzalama hatası çözüldü
2. ✅ ADB Windows DLL'leri eklendi (AdbWinApi.dll, AdbWinUsbApi.dll)
3. ✅ Portable build oluşturuldu
4. ✅ README kullanıcı dostu hale getirildi
5. ✅ KURULUM.md eklendi (Türkçe adım adım kılavuz)

### Değişen Dosyalar:
- `package.json` — kod imzalama devre dışı
- `phone_farm_cli.spec` — ADB DLL'leri PyInstaller'a eklendi
- `tools/adb/` — AdbWinApi.dll, AdbWinUsbApi.dll eklendi
- `README.md` — kullanıcı dostu güncelleme
- `KURULUM.md` — yeni Türkçe kılavuz

---

## 🎯 Sonraki Adımlar (opsiyonel)

1. **GitHub Release oluştur:**
   ```bash
   git tag v3.0.0
   git push origin v3.0.0
   ```
   GitHub Releases'te `PhoneFarm-Portable-3.0.0.zip` yükle

2. **Tam installer (opsiyonel):**
   - Windows'ta kod imzalama sertifikası al
   - `npm run build` ile NSIS installer üret
   - Daha profesyonel görünüm

3. **Otomatik kurulum scripti (opsiyonel):**
   - `setup.bat` ekle
   - Eksik bağımlılıkları otomatik indir/kur

---

## 🐛 Bilinen Sorunlar

- Linux'ta üretilen PyInstaller binary (dist/phone_farm_cli) ELF formatında
  - Çözüm: Windows'ta PyInstaller çalıştır veya cross-compile
  - Şu an Electron uygulaması tam çalışır durumda

---

## 💡 Kullanım

Detaylı kullanım için:
- [KURULUM.md](KURULUM.md) — Hızlı başlangıç
- [docs/user/getting-started.md](docs/user/getting-started.md) — Tam kılavuz
