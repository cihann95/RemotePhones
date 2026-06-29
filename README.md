# Phone Farm v3.0 — Android Telefon Yönetim Platformu

Phone Farm, Android telefonları bilgisayardan yönetmek için bir platformdur. ADB üzerinden cihazlara bağlanıp otomatik görevler çalıştırır (arama, SMS, sağlık kontrolü vs.).

---

## 🚀 Hızlı Başlangıç (Kullanıcı için)

### Gereksinimler
- Windows 10/11 (64-bit)
- Android telefon (USB Hata Ayıklama açık)
- USB kablosu (veri iletimi destekleyen)

### Kurulum (3 Adım)

**1. İndir**  
GitHub Releases sayfasından **PhoneFarm-Portable-3.0.0.zip** dosyasını indir.

**2. Aç**  
ZIP dosyasını istediğin klasöre çıkar (örnek: `C:\PhoneFarm`).

**3. Çalıştır**  
`Phone Farm.exe` dosyasını çift tıkla. İlk açılışta kurulum sihirbazı gelecek.

### Telefonu Hazırla

**USB Hata Ayıklama nasıl açılır:**
1. Ayarlar → Telefon Hakkında → Yapı Numarası'na 7 kez dokun
2. Ayarlar → Geliştirici Seçenekleri → USB Hata Ayıklama'yı aç
3. USB kabloyla bilgisayara bağla
4. Telefonda çıkan izin isteğini kabul et

Hazır! Phone Farm cihazını görecek.

---

## 📖 Detaylı Dökümantasyon

Daha fazla bilgi için:
- [Hızlı Kurulum Kılavuzu](KURULUM.md) — Adım adım kurulum
- [Kullanıcı Kılavuzu](docs/user/getting-started.md) — Temel kullanım
- [Sorun Giderme](docs/user/troubleshooting.md) — Yaygın sorunlar

---

## 🛠️ Geliştirici için

Projeyi geliştirmek istiyorsan:

### Gereksinimler
- Node.js 18+ ve npm
- Python 3.10+
- Git

### Kurulum
```bash
git clone https://github.com/cihann95/RemotePhones.git
cd RemotePhones
npm install
python3 -m venv .venv
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate     # Windows
pip install -r requirements.txt
```

### Geliştirme Modu
```bash
npm start  # Electron GUI başlatır
```

### Build
```bash
# Portable versiyon (installer değil)
npm run build:dir

# Tam installer (kod imzası gerekir)
npm run build
```

### Test
```bash
npm test          # JavaScript testleri
pytest            # Python testleri
```

---

## 📁 Proje Yapısı

```
RemotePhones/
├── src/
│   ├── main/           # Electron main process
│   ├── renderer/       # Electron renderer (UI)
│   └── preload.js      # Electron preload script
├── core/               # Python ADB & device manager
├── scheduler/          # Python job scheduler
├── monitor/            # Python health monitor & API
├── tools/adb/          # ADB binaries (bundled)
├── phone_farm_cli.py   # Python CLI entry point
└── package.json        # Electron config
```

---

## 🤝 Katkı

1. Fork'la
2. Feature branch oluştur: `git checkout -b feature/yeni-ozellik`
3. Commit'le: `git commit -m 'feat: yeni özellik'`
4. Push'la: `git push origin feature/yeni-ozellik`
5. Pull Request aç

---

## 📄 Lisans

MIT License — detaylar için [LICENSE](LICENSE) dosyasına bak.

---

## 🙏 Teşekkürler

- Android Debug Bridge (ADB) ekibi
- Pure Python ADB kütüphanesi
- Electron ve Node.js toplulukları
- Tüm açık kaynak katkıcıları
