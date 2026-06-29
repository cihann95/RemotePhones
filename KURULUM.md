# Phone Farm 3.0 — Hızlı Kurulum Kılavuzu

## Kullanıcı için (Kodlama bilgisi gerektirmez)

### Adım 1: İndir
GitHub Releases sayfasından **PhoneFarm-Portable-3.0.0.zip** dosyasını indir.

### Adım 2: Aç
ZIP dosyasını istediğin bir klasöre çıkar (örnek: `C:\PhoneFarm`).

### Adım 3: Çalıştır
Klasörde **Phone Farm.exe** dosyasını çift tıkla.

### Adım 4: Telefonu Bağla
- Android telefonunda **USB Hata Ayıklama** açık olmalı
- USB kablosuyla bilgisayara bağla
- Telefondan izin ver

Hazır! Uygulama açılacak ve cihazları gösterecek.

---

## Sorun Giderme

**"Cihaz bulunamadı" hatası**
- USB Hata Ayıklama açık mı? (Ayarlar > Geliştirici Seçenekleri)
- USB kablosu veri iletimi destekliyor mu? (Bazı kablolar sadece şarj yapar)

**Uygulama açılmıyor**
- Windows Defender uyarısı çıkarsa "Yine de çalıştır" seç
- Antivirüs Phone Farm'ı engelliyor olabilir (geçici olarak devre dışı bırak)

**"DLL bulunamadı" hatası**
- tools/adb klasöründe 3 dosya olmalı: adb.exe, AdbWinApi.dll, AdbWinUsbApi.dll
- Eksikse ZIP'i tekrar aç

---

## Geliştirici için

Projeyi geliştirmek istiyorsan:
```bash
git clone https://github.com/cihann95/RemotePhones.git
cd RemotePhones
npm install
npm start
```

Detaylar için README.md dosyasına bak.
