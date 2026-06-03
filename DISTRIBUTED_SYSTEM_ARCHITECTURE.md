# Dağıtık Sistem Mimarisi

## Genel Bakış
Phone Farm Backup sistemi, birden çok Android cihazını yönetmek ve otomatikleştirmek için dağıtık bir mimariye dayanmaktadır. Sistem, yönetim katmanı, çalıştırma katmanı ve izleme katmanlarından oluşur.

## Bileşenler

### 1. Telefon Farm Yöneticisi (PhoneFarmManager)
- Merkezi koordinasyon ve yaşam döngüsü yönetimi
- Cihaz yöneticisi, görev sırası, görev çalıştırıcı ve görev kayıt sistemini birleştirir
- Cihaz keşfi, kayıt ve bağlantı işlemlerini yönetir

### 2. Cihaz Yöneticisi (DeviceManager)
- ADB üzerinden Android cihazlarını keşfeder, kaydeder ve yönetir
- Cihaz özelliklerini toplar (model, Android versiyonu, üretici)
- Bağlantı/bağlantısız durum değişikliklerini izler

### 3. Görev Sistemi (Task System)
- Görev Tanımlama Sistemi: Görev tiplerini kayıtlar ve yönetir
- Görev Kuyruğu: Öncelik bazlı görev yönetimi ve sıralama
- Görev Çalıştırıcı: Kuyruktaki görevleri çeker ve çalıştırır
- Beton Görevler: Önceden tanımlanmış otomatikleştirme görevleri (Instagram vb.)

### 4. Zamanlayıcı (Scheduler)
- Zamanlanmış ve döngüsel görev yönetimi
- APScheduler ve schedule kütüphaneleri kullanılarak implementasyon
- Görev öncelikleri ve yeniden deneme mekanizmaları

### 5. İzleme ve API (Monitor)
- FastAPI tabanlı RESTful API endpoints
- Sağlık kontrolleri ve cihaz durumu raporlaması
- Kuyruk durumu ve görev izleme

## Mimari Özellikleri

### Modülerlik
Her bileşen bağımsız olarak geliştirilebilir ve test edilebilir şekilde tasarlanmıştır.

### Esnek Yapılandırma
YAML tabanlı yapılandırma dosyaları ile ortam-spesifik ayarlar desteklenir.

### Hata İzolasyonu
Bir bileşen hatası diğer bileşenleri etkilemez; güvenli kapama mekanizmaları mevcuttur.

### Ölçeklenebilirlik
Çoklu cihaz desteği ve paralel görev işleme ile sistem ölçeklendirilebilir.

## Veri Akışı

1. Sistem Başlatılır
2. PhoneFarmManager başlatılır ve cihaz keşfi yapılır
3. Bulunan cihazlar DeviceManager'a kayıt edilir ve bağlanır
4. Görev kayıt sistemine beton görevler yüklenir
5. Görevler kuyruğa eklenir veya zamanlayıcı tarafından tetiklenir
6. Görev çalıştırıcı kuyruktaki görevleri çeker ve çalıştırır
7. İzleme katmanı sistem sağlığını ve cihaz durumlarını raporlar
8. API üzerinden dış sistemler durum bilgilerine erişebilir

## Güvenilirlik Özellikleri

- Yeniden deneme mekanizmaları (konfigürasyon maximum retry sayısı)
- Bağlantı zaman aşımı ve hata yönetimi
- Durum takibi ve hata raporlama
- Başarısız görevlerin otomatik yeniden kuyruğa eklenmesi