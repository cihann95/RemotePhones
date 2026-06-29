# Phone Farm v3.0 — Windows Kullanıcısı İçin Tam Rehber

## 🎯 BU REHBERİ KİM KULLANMALI?

Kodlama bilmeyen, Python/ADB nedir bilmeyen, sadece Phone Farm'ı kullanmak isteyen Windows kullanıcıları.

---

## 📥 ADIM 1: İNDİR

### GitHub'dan indir:
1. Tarayıcında aç: https://github.com/cihann95/RemotePhones
2. Sağ üstte **Releases** bölümüne tıkla
3. **PhoneFarm-Portable-3.0.0.zip** dosyasını indir (265 MB)

### Alternatif:
Proje sahibi sana direkt ZIP linkini paylaştıysa o linke tıkla.

---

## 📦 ADIM 2: AÇ

1. İndirilen **PhoneFarm-Portable-3.0.0.zip** dosyasına sağ tıkla
2. **"Tümünü ayıkla..."** veya **"Extract All..."** seç
3. Hedef klasör: `C:\PhoneFarm` (istediğin yere seçebilirsin)
4. **Ayıkla** butonuna bas

Dosyalar açıldığında şunları göreceksin:
```
C:\PhoneFarm\
├── Phone Farm.exe       ← BUNU ÇALIŞTIR
├── resources\
├── locales\
└── ...
```

---

## ▶️ ADIM 3: ÇALIŞTIR

1. `Phone Farm.exe` dosyasına **çift tıkla**
2. **Windows Defender** uyarısı çıkarsa:
   - "Daha fazla bilgi" → "Yine de çalıştır" seç
   - (Kod imzası olmadığı için bu normal)
3. İlk açılışta **Kurulum Sihirbazı** gelecek

---

## 📱 ADIM 4: TELEFONU HAZIRLA

### Android telefonunda USB Hata Ayıklama'yı aç:

#### 4.1 Geliştirici Seçeneklerini Aç
1. **Ayarlar** → **Telefon Hakkında** veya **Cihaz Bilgileri**
2. **Yapı Numarası** veya **Build Number** yazısına **7 kez** dokun
3. Ekranda "Artık geliştiricisiniz!" mesajı çıkacak

#### 4.2 USB Hata Ayıklama'yı Aç
1. **Ayarlar** → **Geliştirici Seçenekleri**
2. **USB Hata Ayıklama** seçeneğini **AÇ**

#### 4.3 Bilgisayara Bağla
1. USB kablosuyla telefonu bilgisayara bağla
2. Telefonda "USB hata ayıklamasına izin ver?" sorusu çıkacak
3. **İzin ver** veya **Tamam** bas

---

## ✅ ADIM 5: DOĞRULA

Phone Farm uygulamasında:
1. **Ana ekranda** telefonun görünmesi lazım
2. Model adı, seri numarası, batarya seviyesi gösterilecek
3. **Hazır!** Artık telefonunu yönetebilirsin.

---

## 🛠️ SORUN GİDERME

### ❌ "Cihaz bulunamadı" hatası

**Çözüm 1: USB Kablosu**
- Bazı kablolar sadece şarj yapar, veri iletmez
- Farklı bir USB kablosu dene
- Tercihen orijinal telefon kablosunu kullan

**Çözüm 2: USB Hata Ayıklama**
- Telefonda Geliştirici Seçenekleri → USB Hata Ayıklama **açık mı** kontrol et
- Kapat-aç yap, tekrar dene

**Çözüm 3: USB Bağlantı Noktası**
- Bilgisayarın farklı USB portuna tak
- USB hub kullanıyorsan direkt bilgisayara tak

**Çözüm 4: Sürücüler**
- Windows telefonun sürücülerini otomatik yükler
- Cihaz Yöneticisi'nde (Device Manager) sarı ünlem varsa:
  - Sürücüyü güncelle
  - Telefon markasının sitesinden USB sürücü indir

---

### ❌ "Phone Farm.exe" açılmıyor

**Çözüm 1: Windows Defender**
- Uyarı çıktıysa "Daha fazla bilgi" → "Yine de çalıştır"
- Veya: Windows Güvenlik → Virüs ve tehdit koruması → Phone Farm.exe'yi istisna ekle

**Çözüm 2: Antivirüs**
- Avast, AVG, Kaspersky gibi antivirüsler engelliyor olabilir
- Geçici olarak devre dışı bırak ve dene
- Phone Farm.exe'yi güvenli dosyalar listesine ekle

**Çözüm 3: Dosya Bozuk**
- ZIP'i tekrar indir (eksik indirme olabilir)
- Başka bir çıkarma programı dene (7-Zip, WinRAR)

---

### ❌ Telefon "offline" görünüyor

**Çözüm:**
1. USB kabloyu çıkar, 5 saniye bekle, tekrar tak
2. Telefonda: Ayarlar → Geliştirici Seçenekleri → USB yetkilerini iptal et
3. USB kabloyu tak, yeni izin isteğini kabul et

---

### ❌ "DLL bulunamadı" hatası

**Çözüm:**
- `C:\PhoneFarm\resources\tools\adb\` klasöründe 3 dosya olmalı:
  - adb.exe
  - AdbWinApi.dll
  - AdbWinUsbApi.dll
- Eksikse ZIP'i yeniden aç, tüm dosyaları çıkar

---

## 💡 SIKÇA SORULAN SORULAR

**S: Python veya ADB kurmam gerekiyor mu?**
Hayır! Portable paket her şeyi içinde bulunduruyor.

**S: İnternet bağlantısı gerekli mi?**
Hayır. Telefon USB ile bağlandığında internet gerekmez.

**S: Hangi Android sürümleri destekleniyor?**
Android 5.0 ve üzeri tüm telefonlar çalışır.

**S: Birden fazla telefon bağlanabilir mi?**
Evet. Her telefonu ayrı USB portuyla bağla, hepsi görünecek.

**S: Kaldırmak için ne yapmalıyım?**
`C:\PhoneFarm` klasörünü sil, başka bir şey gerekmez.

---

## 🎓 KULLANIM İPUÇLARI

### Ana Ekran
- **Cihaz Listesi:** Bağlı tüm telefonları gösterir
- **Health (Sağlık):** Batarya, sinyal gücü, durum
- **Run Task:** Otomatik görevler çalıştır (arama, SMS, vs.)

### Ev Modu vs Ofis Modu
- **Ev Modu:** 1-5 telefon, USB direkt bağlı
- **Ofis Modu:** Uzak bağlantı (Tailscale, Parsec)
  - İlk kullanımda Ev Modunu seç

### Güvenlik
- Phone Farm telefonunda sadece **ADB komutları** çalıştırır
- Hiçbir veri internete gönderilmez
- Yerel ağda çalışır

---

## 📞 DESTEK

Sorun devam ediyorsa:
1. Proje sahibine ulaş (GitHub Issues)
2. Hata ekran görüntüsü + telefon modeli paylaş
3. [docs/user/troubleshooting.md](docs/user/troubleshooting.md) dosyasına bak

---

## ✅ ÖZET: 4 ADIM

1. **ZIP indir** → PhoneFarm-Portable-3.0.0.zip
2. **Klasöre aç** → C:\PhoneFarm
3. **Phone Farm.exe çalıştır**
4. **Telefonu bağla** → USB Hata Ayıklama açık

Hepsi bu! Kolay gelsin.
