# Phone Farm Yeni Başlayanlar Rehberi

Phone Farm ile birden fazla Android telefonu bilgisayarınızdan yönetin. Telefonlara arayabilir, sağlık durumlarını kontrol edebilir, görevleri otomatikleştirebilir ve hepsini bir masaüstü programından (GUI) izleyebilirsiniz. Bu rehber, hiç terminal kullanmamış birinin bile adım adım kurulum yapıp kullanmaya başlamasını hedefler.

---

## 1. Phone Farm Nedir?

Phone Farm, bilgisayarınıza USB ile bağladığınız Android telefonları yönetmek için bir platformdur. Telefonlarınızla ADB (Android Debug Bridge) üzerinden konuşur. Yani telefonunuzun geliştirici modunu kullanarak şu işlemleri yapabilirsiniz:

- Telefonların şarj seviyesini, Android sürümünü ve sinyal gücünü görme
- Belirli numaraları arama, gelen aramaları cevaplama veya reddetme
- Birden fazla telefonda aynı anda görev çalıştırma
- CSV dosyasından toplu arama yapma
- Tüm telefonları bir masaüstü programından (GUI) izleme

Proje iki ana parçadan oluşur:

| Bileşen | Görevi |
|---------|--------|
| Python arka ucu | ADB ile telefonlara komut gönderir, görevleri yönetir |
| Electron masaüstü programı | Telefonları görsel bir arayüzde gösterir, yönetmenizi sağlar |

**Bu rehber kimler için:** Daha önce komut satırı (terminal) kullanmamış kişiler, küçük ölçekli telefon yönetimi yapmak isteyenler, Phone Farm ile yeni tanışan herkes.

---

## 2. Gereksinimler (Neye İhtiyacınız Var?)

Başlamak için ihtiyacınız olan donanım ve yazılımlar:

### Donanım Gereksinimleri

| Gereksinim | Neden Gerekli? | Nereden Bulunur? |
|------------|----------------|------------------|
| Windows bilgisayar | Phone Farm Windows üzerinde çalışır | Mevcut bilgisayarınız |
| Veri aktarımı destekleyen USB kablo | ADB iletişimi için veri aktarımı şart | Telefonunuzla gelen kablo veya yeni bir kablo |
| Android telefon (Android 5.0 veya üstü) | ADB tüm Android sürümlerinde çalışır | Mevcut telefonunuz |
| USB Hub (isteğe bağlı) | Birden fazla telefon bağlamak için | Teknoloji mağazaları, online satış siteleri |

### Yazılım Gereksinimleri

| Gereksinim | Neden Gerekli? | Nasıl Edinilir? |
|------------|----------------|-----------------|
| Python 3.8 veya daha yenisi | Phone Farm Python ile yazılmıştır | [python.org](https://python.org) adresinden indirin |
| ADB (platform-tools) | Bilgisayar-telefon iletişimi için | [Google platform-tools](https://developer.android.com/studio/releases/platform-tools) |
| Node.js 18 veya daha yenisi | Masaüstü programı (GUI) için | [nodejs.org](https://nodejs.org) adresinden indirin |
| Git | Projeyi indirmek için | [git-scm.com](https://git-scm.com) adresinden indirin |

**Not:** Sadece CLI (komut satırı) kullanacaksanız Node.js ve Git gerekli değildir. Projeyi ZIP olarak da indirebilirsiniz.

---

## 3. Adım Adım Kurulum

Aşağıdaki adımları sırayla uygulayın. Her adımın sonunda bir doğrulama var. Doğrulama başarısızsa bir önceki adıma dönüp kontrol edin.

### 3.1 Python Kurulumu

1. [python.org](https://python.org) adresine gidin.
2. Sayfadaki "Downloads" butonuna tıklayın. Site işletim sisteminizi otomatik algılayarak doğru sürümü gösterir.
3. Python 3.8 veya daha yeni bir sürümü indirin (örneğin: Python 3.12.x).
4. İndirdiğiniz `.exe` dosyasına çift tıklayarak çalıştırın.
5. **Çok önemli:** Açılan pencerede en alttaki **"Add Python to PATH"** kutusunu **işaretleyin**. Bu kutu işaretlenmezse Python sonraki adımlarda çalışmaz.
6. "Install Now" butonuna tıklayın. Kurulum tamamlanana kadar bekleyin.

**Doğrulama:**

Komut İstemi'ni (Command Prompt) açın:

- Başlat menüsüne sağ tıklayın, "Terminal" veya "Command Prompt" seçin.
- Ya da Windows tuşuna basıp `cmd` yazın ve Enter'a basın.

Aşağıdaki komutu yazın:

```bash
python --version
```

Ekranda şu şekilde bir çıktı görmelisiniz:

```
Python 3.12.2
```

Gördüğünüz sürüm numarası farklı olabilir, önemli olan 3.8 veya üzeri olması.

**Hata alırsanız:** `'python' is not recognized` yazıyorsa "Add Python to PATH" kutusunu işaretlemeyi unuttunuz demektir. Python'u yeniden kurun ve kutuyu işaretlediğinizden emin olun.

### 3.2 ADB Kurulumu

ADB (Android Debug Bridge), bilgisayarınızla telefonunuz arasında iletişim kuran bir araçtır.

1. Google'in platform-tools paketini indirin:
   [https://developer.android.com/studio/releases/platform-tools](https://developer.android.com/studio/releases/platform-tools)
2. Sayfada "Download Platform Tools for Windows" linkine tıklayın.
3. İndirdiğiniz `platform-tools-latest-windows.zip` dosyasını açın.
4. ZIP dosyasının içindeki `platform-tools` klasörünü `C:\platform-tools` konumuna taşıyın (veya kopyalayın).

**ADB'yi sistem PATH'ine ekleme adımları:**

1. Başlat menüsüne "Ortam Değişkenleri" (Environment Variables) yazın ve ilk sonuca tıklayın.
2. Açılan pencerede "Ortam Değişkenleri" (Environment Variables) butonuna tıklayın.
3. "Sistem değişkenleri" (System Variables) kısmında "Path" i bulun ve seçin.
4. "Düzenle" (Edit) butonuna tıklayın.
5. "Yeni" (New) butonuna tıklayın ve `C:\platform-tools` yazıp Enter'a basın.
6. "Tamam" (OK) diyerek tüm pencereleri kapatın.
7. Komut İstemi'ni kapatıp yeniden açın. (PATH değişikliklerinin geçerli olması için terminalin yeniden başlatılması gerekir.)

**Doğrulama:**

```bash
adb --version
```

Çıktı şu şekilde olmalı (sürüm numarası farklı olabilir):

```
Android Debug Bridge version 1.0.41
Version 35.0.2-12147458
Installed as C:\platform-tools\adb.exe
```

**Hata alırsanız:** `'adb' is not recognized` hatası alıyorsanız PATH'e ekleme adımını doğru yapamamış olabilirsiniz. Aşağıdaki komutla PATH'inizi kontrol edin:

```bash
echo %PATH%
```

Çıktıda `C:\platform-tools` yazısını görmelisiniz. Yoksa adımları tekrar uygulayın.

### 3.3 USB Hata Ayıklama (USB Debugging) Aktif Etme

Bu adım tamamen telefonunuzda yapılır. Telefonunuzda Geliştirici Seçenekleri (Developer Options) henüz yoksa önce onu açmanız gerekir.

**Geliştirici Seçenekleri'ni açma:**

1. Telefonunuzda **Ayarlar** (Settings) uygulamasını açın.
2. **Telefon Hakkında** (About Phone) bölümüne gidin.
   - Bu bölüm bazen "Cihaz Hakkında", "Telefon Bilgisi" veya "System > About Phone" altında olabilir.
3. **Derleme Numarası** (Build Number) yazısını bulun. Genellikle "Sürüm" veya "Software Information" altında olur.
4. Derleme Numarası'na **7 kere** peş peşe tıklayın.
5. 3-4 tıktan sonra "Artık bir geliştirici olmanıza X adım kaldı" benzeri bir uyarı göreceksiniz.
6. 7 tıktan sonra **"Artık bir geliştiricisiniz!"** (You are now a developer!) yazısı çıkacak.

**USB Hata Ayıklama'yı açma:**

1. Geri gelip **Ayarlar > Geliştirici Seçenekleri** (Settings > Developer Options) bölümüne girin.
   - Bu bölüm bazı telefonlarda "System > Developer Options" altında olabilir.
2. Sayfada **USB Hata Ayıklama** (USB Debugging) seçeneğini bulun.
3. Anahtarı **Açın** (toggle ON).
4. Çıkan uyarıda "Tamam" (OK) tıklayın.

**Bağlantı ve doğrulama:**

1. Telefonu USB kablo ile bilgisayara bağlayın.
2. Telefon ekranında "USB Hata Ayıklama'ya izin veriliyor" (Allow USB Debugging?) uyarısı çıkacaktır.
3. "Bilgisayarın RSA anahtar parmak izin..." yazısını gördükten sonra **"Kabul Et"** (Allow) tıklayın.
4. İsteğe bağlı olarak "Her zaman bu bilgisayardan izin ver" kutusunu işaretleyebilirsiniz.

**Doğrulama:**

Bilgisayarınızda Komut İstemi'nde şu komutu çalıştırın:

```bash
adb devices
```

Çıktı şu şekilde olmalı:

```
List of devices attached
XXXXXXXXXXXX    device
```

`XXXXXXXXXXXX` yerine telefonunuzun seri numarasını görmelisiniz. Seri numarasının yanında `device` yazısı olmalı.

**Olası sorunlar:**
- `offline` yazıyorsa: USB kabloyu çıkarıp tekrar takın. Telefon ekranındaki uyarıyı kabul edin.
- Boş liste görüyorsanız: USB kablonuz veri aktarımı desteklemiyor olabilir. Farklı bir kablo deneyin.
- `unauthorized` yazıyorsa: Telefon ekranındaki RSA uyarısını kabul etmemişsinizdir. Kabloyu çıkarıp tekrar takın ve uyarıyı kabul edin.

### 3.4 Projeyi İndirme ve Bağımlılıkları Kurma

**Yöntem 1: Git ile (Tavsiye edilen)**

```bash
git clone https://github.com/your-org/phone-farm-backup.git
cd phone-farm-backup
```

`your-org` kısmını projenin gerçek GitHub adresiyle değiştirin.

**Yöntem 2: ZIP olarak indirme**

1. GitHub sayfasında "Code" butonuna tıklayın.
2. "Download ZIP" seçin.
3. ZIP dosyasını masaüstüne veya kolay bir konuma çıkarın.
4. Komut İstemi'nden çıkardığınız klasöre gidin:

```bash
cd C:\Users\kullaniciadiniz\Desktop\phone-farm-backup-main
```

**Python bağımlılıklarını yükleme:**

```bash
pip install -r requirements.txt
```

Bu komut, Phone Farm'in ihtiyaç duyduğu tüm Python kütüphanelerini indirip yükler. Yükleme sırasında birkaç dakika sürebilir.

**Doğrulama:**

```bash
python phone_farm_cli.py --help
```

Çıktı şu komut listesini göstermeli:

```
Phone Farm CLI - Mobile Device Automation

Usage: python phone_farm_cli.py <command> [options]

Commands:
  discover              Discover connected ADB devices
  health <device_id>    Run health check on a device
  run <device_id> <task> [--param key=value]  Execute a task
  submit <device_id> <task_file>  Submit a task file
  status <job_id>       Check job status
  call <device_id> --number <phone>  Make a phone call
```

Komut listesini görüyorsanız kurulum başarılı demektir.

**Hata alırsanız:** `ModuleNotFoundError` şeklinde bir hata alırsanız `pip install -r requirements.txt` komutunu tekrar çalıştırın.

### 3.5 İlk Cihaz Bağlantısı

Telefonunuzu Phone Farm'a tanıtmak için:

1. Telefonunuzun USB kabloyla bilgisayara bağlı olduğundan emin olun.
2. Telefon ekranında USB Hata Ayıklama uyarısı çıktıysa "Kabul Et" tıklayın.
3. Önce ADB'nin telefonu gördüğünü doğrulayın:

```bash
adb devices
```

Seri numaranız `device` yanında görünüyor olmalı.

4. Şimdi Phone Farm ile cihazları keşfedin:

```bash
python phone_farm_cli.py discover
```

**Doğrulama:**

Çıktı şu şekilde olmalı:

```json
{
  "devices": [
    "XXXXXXXXXXXX"
  ]
}
{
  "serial": "XXXXXXXXXXXX",
  "state": "device"
}
```

Telefonunuzun seri numarasını ve `"state": "device"` yazısını görmelisiniz.

**Birden fazla telefon bağlıysa:** Hepsi listede görünür. Her birinin farklı bir seri numarası vardır.

### 3.6 İlk Sağlık Kontrolü

Telefonunuzun Phone Farm'a doğru yanıt verdiğini doğrulamak için bir sağlık kontrolü yapın.

`XXXXXXXXXXXX` yerine kendi seri numaranızı yazarak:

```bash
python phone_farm_cli.py health XXXXXXXXXXXX
```

**Beklenen çıktı:**

```json
{
  "device_id": "XXXXXXXXXXXX",
  "battery": 85,
  "android_version": "13",
  "signal": "good",
  "connection": "device",
  "model": "SM-G998B"
}
```

Her alanın anlamı:

| Alan | Anlamı | Normal Değer |
|------|--------|--------------|
| `battery` | Şarj yüzdesi | 0-100 arası |
| `android_version` | Android sürüm numarası | 5.0 veya üstü |
| `signal` | Sinyal gücü | good, fair, poor, none |
| `connection` | ADB bağlantı durumu | device, offline, unauthorized |
| `model` | Telefon modeli | Marka/model kodu |

**Kurulum tamamlandı.** Artık Phone Farm kullanmaya hazırsınız.

---

## 4. Temel Komutlar

Tüm komutlar, proje ana klasöründen `python phone_farm_cli.py` ile çalıştırılır.

### discover

Bağlı Android cihazları listeler.

```bash
python phone_farm_cli.py discover
```

**Örnek çıktı:**

```json
{
  "devices": [
    "R58NC45XYZ",
    "R58NC46ABC"
  ]
}
```

Birden fazla telefon bağlıysa hepsini gösterir. Her telefonun kendine özel bir seri numarası vardır.

### health

Bir cihazın sağlık durumunu kontrol eder.

```bash
python phone_farm_cli.py health <cihaz_numarasi>
```

**Örnek:**

```bash
python phone_farm_cli.py health R58NC45XYZ
```

Gösterdiği bilgiler: şarj yüzdesi, Android sürümü, sinyal gücü, bağlantı durumu ve telefon modeli.

### run

Bir cihazda görev çalıştırır.

```bash
python phone_farm_cli.py run <cihaz_numarasi> <görev_adi> [--param anahtar=deger]
```

Kullanılabilir görevler:

| Görev | Ne Yapar? |
|-------|-----------|
| `call` | Belirtilen numarayı arar. `--param number=...` ile numara verilmelidir |
| `answer` | Gelen aramayı cevaplar |
| `reject` | Gelen aramayı reddeder |
| `hangup` | Devam eden bir aramayı kapatır |
| `unlock` | Telefon ekranını açar |

**Arama yapma örneği:**

```bash
python phone_farm_cli.py run R58NC45XYZ call --param number=+905XXXXXXXXX
```

Her `run` komutu bir iş numarası (job ID) döner. Bu numarayı `status` komutuyla kullanmak üzere saklayın.

### call

Arama yapmak için kısayol bir komuttur. Bir numarayı arayabilir veya CSV dosyasından toplu arama yapabilirsiniz.

**Tekli arama:**

```bash
python phone_farm_cli.py call <cihaz_numarasi> --number +905XXXXXXXXX
```

**Toplu arama (CSV ile):**

```bash
python phone_farm_cli.py call <cihaz_numarasi> --csv-file numbers.csv
```

### submit

Bir JSON dosyasındaki adımları toplu olarak gönderir.

```bash
python phone_farm_cli.py submit <cihaz_numarasi> steps.json
```

Örnek `steps.json` dosyası:

```json
[
  {
    "task": "call",
    "params": {
      "number": "+905551111111"
    }
  },
  {
    "task": "hangup",
    "params": {}
  }
]
```

Her adım sırayla çalıştırılır.

### status

Bir görevin veya yöneticinin durumunu gösterir.

```bash
python phone_farm_cli.py status <is_numarasi>
python phone_farm_cli.py status --summary
```

**İş durumu sorgulama örneği:**

```bash
python phone_farm_cli.py status job_abc123
```

**Olası durumlar:**

| Durum | Anlamı |
|-------|--------|
| `pending` | Görev sıraya alındı, henüz başlamadı |
| `running` | Görev şu anda çalışıyor |
| `completed` | Görev başarıyla tamamlandı |
| `failed` | Görev hata ile sonlandı |

---

## 5. GUI Kullanımı (Masaüstü Uygulaması)

Phone Farm, telefonları görsel olarak göstermek ve yönetmek için bir masaüstü programına sahiptir. Bu program Electron teknolojisiyle yapılmıştır.

### Başlatma

İki yoldan birini kullanın:

```bash
npm start
```

veya `launch.bat` dosyasına çift tıklayın.

**GUI'yi ilk kez başlatıyorsanız,** önce bağımlılıkları yüklemeniz gerekir:

```bash
npm install
npm start
```

`npm install` komutu sadece bir kez çalıştırılır. Sonraki açılışlarda doğrudan `npm start` kullanabilirsiniz.

### İlk Açılış -- Kurulum Sihirbazı

GUI ilk kez açıldığında bir karşılama sihirbazı (Setup Wizard) açılır. Size iki mod sunar:

#### Ev Modu (Home Mode / EV)

Telefonlarınız doğrudan USB ile bağlıysa bu modu seçin. Basittir. Tüm bağlı cihazları bir listede görür ve hemen görev çalıştırabilirsiniz. Küçük düzenekler, test ve kişisel projeler için uygundur.

**Ne zaman seçmeli:** Evde tek bilgisayar kullanıyorsanız, 1-5 telefonunuz varsa, telefonlar yanınızdaysa.

#### Ofis Modu (Office Mode / OFIS)

Telefonları ağ üzerinden yönetiyorsanız bu modu seçin. Cihazlar Tailscale veya Parsec gibi araçlarla uzaktan bağlanabilir. Ofis modunda iş kuyrukları, zamanlama ve bir kontrol paneli vardır. Çok sayıda cihazı farklı yerlerde yönetmek için uygundur.

**Ne zaman seçmeli:** Telefonlar farklı bir odada veya farklı bir şehirdeyse, 5'ten fazla telefonunuz varsa, ekip olarak çalışıyorsanız.

### Ana Ekran Bölümleri

Kurulum sihirbazından sonra karşınıza şu bölümler çıkar:

| Bölüm | Ne İş Yapar? |
|-------|-------------|
| Cihaz Listesi (Device List) | Her bağlı telefonun seri numarasını, modelini ve bağlantı durumunu gösterir. Cihazlar kart şeklinde listelenir. |
| Çiftlik Kontrolleri (Farm Controls) | İzlemeyi başlatmak veya durdurmak için düğmeler. "Start Farm" ile başlatılır, "Stop Farm" ile durdurulur. |
| Görev Paneli (Task Panel) | Seçili cihazlarda görev çalıştırır veya çalışan görevleri gösterir. Görev seçip "Run" butonuna tıklayarak çalıştırabilirsiniz. |
| Telefon Paneli (Phone Panel) | Seçili telefonun detaylı bilgilerini ve arama kontrollerini gösterir. |
| Sağlık Paneli (Health Dashboard) | Tüm cihazların şarj durumunu, sinyal gücünü ve bağlantı kalitesini görsel olarak özetler. |

### Ayarlar

Ayarlar penceresine şu yollardan ulaşabilirsiniz:

- **Klavye kısayolu:** `Ctrl + ,` (Ctrl tuşu ve virgül)
- Menüden: File > Settings (veya uygulama ayarlar simgesi)

**Ayarlarda yapabilecekleriniz:**

| Ayar | Açıklama |
|------|----------|
| Mod değiştirme | Ev Modu (EV) ile Ofis Modu (OFIS) arasında geçiş. Mod değiştiğinde cihaz listesi yeniden yüklenir. |
| Güncellemeler | Yeni sürüm bildirimlerini açma/kapama |
| Görüntü ayarları | Cihaz listesinin görüntüleme şekli (kart görüntüsü veya liste görüntüsü) |

---

## 6. Telefon Görüşmeleri (Detaylı)

Phone Farm, bağlı telefonlar üzerinden arama yapabilir, gelen aramaları cevaplayabilir ve kapatabilir.

### Numara Formatı

İki farklı formatta numara girebilirsiniz:

| Format | Örnek | Açıklama |
|--------|-------|----------|
| Uluslararası | `+905XXXXXXXXX` | +90 (Türkiye kodu), 5 (operatör kodu), 10 hane |
| Sıfır ile yerel | `05XXXXXXXXX` | Başında 0, sonra 5, sonra 10 hane |

Phone Farm her iki formatı da otomatik olarak doğru formata çevirir.

### GUI ile Arama

1. GUI'yi başlatmak için `npm start` yazın.
2. Sol taraftaki cihaz listesinden kullanmak istediğiniz telefona tıklayın.
3. Telefon Paneli'nde (Phone Panel) arama kutusunu bulun.
4. Aramak istediğiniz numarayı `+905XXXXXXXXX` formatında yazın.
5. "Ara" (Call) butonuna tıklayın.

**Arama durumu göstergeleri:**

| Durum | GUI'de Görüntülenme Şekli |
|-------|---------------------------|
| dialing | "Aranıyor..." yazısı, turuncu simge |
| ringing | "Telefon Çalıyor..." yazısı, sarı simge |
| active | "Görüşme Başladı" yazısı, yeşil simge |
| completed | "Görüşme Sona Erdi" yazısı, gri simge |
| failed | "Başarısız" yazısı, kırmızı simge |

### CLI ile Arama

**Tekli arama yapma:**

```bash
python phone_farm_cli.py run R58NC45XYZ call --param number=+905XXXXXXXXX
```

Veya kısayol ile:

```bash
python phone_farm_cli.py call R58NC45XYZ --number +905XXXXXXXXX
```

**Çıktı örneği:**

```json
{
  "job_id": "job_abc123",
  "status": "running"
}
```

**Gelen aramayı cevaplama:**

```bash
python phone_farm_cli.py run R58NC45XYZ answer
```

**Gelen aramayı reddetme:**

```bash
python phone_farm_cli.py run R58NC45XYZ reject
```

**Aramayı kapatma:**

```bash
python phone_farm_cli.py run R58NC45XYZ hangup
```

### Toplu Arama (CSV ile)

Önce bir CSV dosyası hazırlayın. Dosyanın içinde `phone` başlıklı bir sütun olsun:

```csv
phone
+905551111111
+905552222222
+905553333333
```

İsterseniz `name` sütunu da ekleyebilirsiniz:

```csv
phone,name
+905551111111,"Ahmet Yılmaz"
+905552222222,"Ayşe Demir"
+905553333333,"Mehmet Kaya"
```

CSV dosyasını Phone Farm'a gönderin:

```bash
python phone_farm_cli.py submit R58NC45XYZ aramalar.csv
```

**Alternatif olarak `call` komutu ile:**

```bash
python phone_farm_cli.py call R58NC45XYZ --csv-file aramalar.csv
```

Her numara için bir görev oluşturulur ve size bir iş numarası (job ID) verilir.

### Arama Durumlarını İzleme

Bir aramanın durumunu sorgulamak için:

```bash
python phone_farm_cli.py status <is_numarasi>
```

**Olası arama durumları:**

| Durum | Anlamı |
|-------|--------|
| `dialing` | Numara aranıyor. Telefon cihazdan numarayı tuşluyor. |
| `ringing` | Karşı tarafta telefon çalıyor. Karşıdaki kişi henüz açmadı. |
| `active` | Görüşme başladı. Karşıdaki kişi aramayı açmış durumda. |
| `completed` | Görüşme sonlandı. Taraflardan biri kapatmış. |
| `failed` | Arama başarısız oldu. Numara yanlış, sinyal yok veya başka bir hata. |

---

## 7. Sorun Giderme

Karşılaşabileceğiniz yaygın sorunlar ve çözümleri.

### Cihaz Bulunamadı

`python phone_farm_cli.py discover` komutu boş liste döndürüyor.

**Belirti:** Çıktı olarak `{"devices": []}` görüyorsunuz.

**Olası nedenler ve çözümler:**

- USB Hata Ayıklama'nın açık olduğundan emin olun. Ayarlar > Geliştirici Seçenekleri > USB Hata Ayıklama.
- Farklı bir USB kablo deneyin. Bazı kablolar sadece şarj içindir, veri taşımaz.
- `adb devices` komutunu doğrudan çalıştırın. O da boş döndürüyorsa sorun ADB iledir, Phone Farm ile değil.
- Telefonu ve bilgisayarı yeniden başlatmayı deneyin.
- Telefonunuzun kilitli olmadığından emin olun. Bazı telefonlarda ekran kilitliyken ADB bağlantısı kısıtlanır.

### ADB Bulunamadı

`'adb' is not recognized` veya `command not found` hatası alıyorsunuz.

**Belirti:** `adb` yazdığınız komut çalışmıyor, hata veriyor.

**Çözüm:**

1. platform-tools ZIP dosyasını `C:\platform-tools` klasörüne doğru şekilde çıkarttığınızdan emin olun.
2. PATH ekleme adımlarını tekrar uygulayın.
3. Terminali kapatıp yeniden açın.
4. PATH'i kontrol edin:

```bash
echo %PATH%
```

Çıktıda `C:\platform-tools` yolunun göründüğünden emin olun.

### Cihaz "offline" Görünüyor

`adb devices` çıktısında cihaz seri numarasının yanında `offline` yazıyor.

**Belirti:**

```
List of devices attached
XXXXXXXXXXXX    offline
```

**Çözüm:**

1. USB kabloyu çıkarıp tekrar takın.
2. Telefonda "USB Hata Ayıklama Yetkilerini İptal Et" (Revoke USB Debugging Authorizations) seçeneğini kullanın:
   - Geliştirici Seçenekleri > "USB Hata Ayıklama Yetkilerini İptal Et"
   - Kabloyu çıkarıp tekrar takın
   - Telefon ekranındaki RSA uyarısını kabul edin
3. ADB sunucusunu yeniden başlatın:

```bash
adb kill-server
adb start-server
```

4. `adb devices` ile tekrar kontrol edin.

### Görev Başarısız Oluyor

Bir görev başlıyor ama hata ile bitiyor.

**Belirti:** `status` sorgusunda `failed` durumu görüyorsunuz.

**Çözüm:**

1. Önce bir sağlık kontrolü yapın:

```bash
python phone_farm_cli.py health <cihaz_numarasi>
```

2. İş durumunu detaylı kontrol edin:

```bash
python phone_farm_cli.py status <is_numarasi>
```

3. Telefon ekranının açık ve kilitli olmadığından emin olun. Ekran kilitliyken bazı görevler (unlock hariç) çalışmaz.
4. Görev parametrelerini kontrol edin. Örneğin `call` görevi için `--param number=...` zorunludur.

### Arama Başarısız Oluyor

Arama görevi hata veriyor veya hiç ses gitmiyor.

**Belirti:** `failed` durumu veya hata mesajı.

**Çözüm:**

1. Numara formatını kontrol edin: `+905XXXXXXXXX` veya `05XXXXXXXXX` kullanın.
2. Telefonda aktif bir SIM kart olduğundan emin olun.
3. Telefonun ağ sinyali olduğunu kontrol edin (sağlık kontrolü yaparak).
4. Telefonun uçak modunda (Airplane Mode) olmadığından emin olun.
5. Telefonda arama engelleme veya yönlendirme ayarlarını kontrol edin.

### GUI Açılmıyor

Electron masaüstü programı açılmıyor veya hata veriyor.

**Belirti:** `npm start` yazdığınızda hata alıyorsunuz veya pencere açılmıyor.

**Çözüm:**

1. Node.js kurulu mu kontrol edin:

```bash
node --version
```

Sürüm 18 veya üzeri olmalı.

2. Eksik bağımlılıkları yükleyin:

```bash
npm install
```

Bu komut `node_modules` klasörünü oluşturur ve gerekli kütüphaneleri indirir.

3. Terminaldeki hata mesajlarına bakın. Orada genellikle neyin eksik olduğu yazar.
4. `launch.bat` dosyasını yönetici olarak çalıştırmayı deneyin (sağ tık > Yönetici olarak çalıştır).

---

## 8. İpuçları

**1. Telefon ekranını açık tutun.**

Bazı görevler (arama yapmak, ekrana dokunmak) ekranın açık olmasını gerektirir. Telefonunuzun uyku moduna geçmesini engellemek için Geliştirici Seçeneklerinde **"Uyanık kal"** (Stay Awake) özelliğini açın. Bu özellik, telefon şarja bağlıyken ekranın hiç kapanmamasını sağlar.

**2. Her zaman sağlık kontrolü ile başlayın.**

Bir görev çalıştırmadan önce `health` komutu ile cihazın yanıt verdiğini doğrulayın. Bu, sorunları daha erken yakalamanızı sağlar. Sağlık kontrolü başarısızsa görev de başarısız olacaktır.

```bash
python phone_farm_cli.py health <cihaz_numarasi>
```

**3. CSV dosyanızı düzgün hazırlayın.**

Toplu arama yaparken CSV dosyasında başka sütunlar olmamalı veya `phone` sütununun adı farklı olmamalı. Basit bir metin düzenleyici (Notepad gibi) kullanın. Excel bazen tuhaf karakterler (tırnak işareti, noktalı virgül) ekleyebilir.

**4. İş numarasını not edin.**

Her görev bir iş numarası (job ID) döner. Bu numarayı `status` komutu ile kullanmak için kaydedin. İş numarası olmadan görev durumunu sorgulayamazsınız.

**5. USB kablonuzu test edin.**

Bazı USB kabloları sadece şarj içindir. Telefonunuzu bilgisayara bağladığınızda "Dosya Aktarımı" (File Transfer) seçeneği çıkmıyorsa kablonuz veri aktarımı desteklemiyor olabilir. Her zaman telefonunuzla gelen orijinal kabloyu kullanmanızı tavsiye ederiz.

**6. Çoklu cihaz için seri numaralarını etiketleyin.**

Birden fazla telefon yönetiyorsanız, her birine küçük bir etiket yapıştırıp seri numarasının son 4 hanesini yazın. Böylece hangi telefonun hangisi olduğunu karıştırmazsınız. Seri numaraları genellikle uzun ve hatırlanması zordur.

**7. Terminalde takılı kalan komutları durdurun.**

Bazı komutlar uzun sürebilir veya beklemede kalabilir. Komut çalışırken terminali kapatmayın. Bunun yerine:

- `Ctrl + C` tuşlarına basarak çalışan komutu durdurabilirsiniz.
- `Ctrl + D` ile terminal oturumunu sonlandırabilirsiniz.

---

## 9. Hızlı Referans

### CLI Komutları

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `discover` | Bağlı cihazları listeler | `python phone_farm_cli.py discover` |
| `health` | Cihaz sağlık durumu gösterir | `python phone_farm_cli.py health R58NC45XYZ` |
| `run ... call` | Arama yapar | `python phone_farm_cli.py run R58NC45XYZ call --param number=+905XXXXXXXXX` |
| `run ... answer` | Gelen aramayı cevaplar | `python phone_farm_cli.py run R58NC45XYZ answer` |
| `run ... reject` | Gelen aramayı reddeder | `python phone_farm_cli.py run R58NC45XYZ reject` |
| `run ... hangup` | Aramayı kapatır | `python phone_farm_cli.py run R58NC45XYZ hangup` |
| `run ... unlock` | Telefon kilidini açar | `python phone_farm_cli.py run R58NC45XYZ unlock` |
| `call --number` | Kısayol arama yapar | `python phone_farm_cli.py call R58NC45XYZ --number +905XXXXXXXXX` |
| `call --csv-file` | CSV'den toplu arama yapar | `python phone_farm_cli.py call R58NC45XYZ --csv-file numbers.csv` |
| `submit` | JSON adım dosyası gönderir | `python phone_farm_cli.py submit R58NC45XYZ steps.json` |
| `status` | İş durumunu gösterir | `python phone_farm_cli.py status job_abc123` |
| `status --summary` | Yönetici özetini gösterir | `python phone_farm_cli.py status --summary` |

### GUI Kısayolları

```bash
npm start          # GUI'yi başlatır
launch.bat         # GUI'yi başlatır (çift tıklanabilir)
npm install        # GUI bağımlılıklarını yükler (ilk seferde gerekli)
```

| Kısayol | Ne Yapar? |
|---------|-----------|
| `Ctrl + ,` | Ayarlar penceresini açar |
| `Ctrl + R` | Cihaz listesini yeniler |

---

## 10. Sıkça Sorulan Sorular

**S: Phone Farm ücretsiz mi?**

Evet, Phone Farm açık kaynaklı ve MIT lisansı ile lisanslanmıştır. Ücretsiz kullanabilir, değiştirebilir ve dağıtabilirsiniz. Projenin kaynak koduna GitHub üzerinden ulaşabilirsiniz.

**S: Kaç telefon bağlayabilirim?**

Sınır yok. Bilgisayarınızdaki USB portları ve ADB'nin kaldırabildiği kadar telefon bağlayabilirsiniz. Çok sayıda telefon için USB hub kullanabilirsiniz. Pratik sınır, bilgisayarınızın USB denetleyicisine ve güç kaynağına bağlıdır.

**S: Telefonumun root'lu olması gerekir mi?**

Hayır. Phone Farm, root gerektirmez. Sadece USB Hata Ayıklama (USB Debugging) özelliğinin açık olması yeterlidir. Telefonunuzu root'lamanıza gerek yoktur.

**S: iPhone destekleniyor mu?**

Hayır. Phone Farm sadece Android telefonlar içindir. iPhone'lar ADB (Android Debug Bridge) desteklemez. iPhone'lar için farklı araçlar kullanmanız gerekir.

**S: GUI'yi kullanmak zorunda mıyım?**

Hayır. Tüm işlemler CLI üzerinden de yapılabilir. GUI sadece görsel kolaylık içindir. Sadece komut satırını kullanarak da tüm görevleri çalıştırabilir, arama yapabilir ve cihazları yönetebilirsiniz. GUI, özellikle birden fazla cihazı aynı anda izlemek için kolaylık sağlar.

**S: Bilgisayar kapandığında görevler ne olur?**

Görevler bilgisayarınızda çalıştığı için bilgisayar kapandığında tüm görevler durur. Devam eden bir iş varsa kaybolur. Bilgisayarınızı kapatmadan önce tüm görevlerin tamamlanmasını bekleyin.

**S: Telefonu USB'den çıkarırsam ne olur?**

Telefon bağlantısı kesilir. Çalışan görevler başarısız olur. Telefonu tekrar bağladığınızda `discover` komutu ile yeniden keşfedebilirsiniz. Telefonu çıkarmadan önce herhangi bir görev çalıştırmadığınızdan emin olun.

**S: Arama yapmak için telefonun ekranı açık olmalı mı?**

Evet, çoğu durumda telefon ekranının açık olması gerekir. Telefonunuzun uyku moduna geçmesini engellemek için Geliştirici Seçeneklerinde "Uyanık kal" (Stay Awake) özelliğini açın. Bu özellik, telefon şarja bağlıyken ekranın kapanmasını engeller.

**S: Hata alıyorum, ne yapmalıyım?**

Önce bu rehberdeki 7. bölüm (Sorun Giderme) kısmına bakın. Sorununuzu orada bulamazsanız, terminaldeki hata mesajını dikkatlice okuyun. Çözüm bulamazsanız, projenin GitHub sayfasında bir hata raporu (issue) açabilirsiniz.

**S: Python bilmiyorum, kullanabilir miyim?**

Evet. Phone Farm'i kullanmak için Python bilmenize gerek yok. Sadece kurulum adımlarını uygulayıp komutları yazmanız yeterli. Komutları yazmak için de bu rehberdeki örnekleri kopyalayabilirsiniz.

**S: Linux veya Mac'te çalışır mı?**

Proje Windows için yapılmıştır. ADB Linux ve Mac'te de çalışır, ancak `launch.bat` Windows'a özeldir. CLI komutları Linux ve Mac'te çalışabilir. GUI (Electron) için Linux ve Mac'te ek ayarlar gerekebilir. Linux ve Mac kullanıcıları için ayrı bir rehber hazırlanmamıştır.

---

## 11. Daha Fazla Bilgi

Bu rehber temel kullanım içindir. Detaylı bilgi için aşağıdaki diğer dökümanlara göz atabilirsiniz:

- [Başlangıç Rehberi](getting-started.md) -- Kurulum adımları ve ilk bağlantı
- [Karşılama Sihirbazı](setup-wizard.md) -- GUI ilk açılış ayarları, EV ve OFIS modları
- [Komut Satırı Referansı](cli-reference.md) -- Tüm komutların detaylı açıklaması
- [Cihaz Yönetimi](device-management.md) -- Cihaz keşfetme, sağlık kontrolü, görev çalıştırma
- [Telefon Görüşmeleri](phone-calls.md) -- Arama yapma, cevaplama, toplu arama
- [Sorun Giderme](troubleshooting.md) -- Yaygın sorunlar ve çözümleri
- [Sözlük](glossary.md) -- ADB, USB Debugging ve diğer terimlerin açıklamaları
