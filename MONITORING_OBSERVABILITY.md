# Kapsamlı Monitoring ve Observability

## Genel Bakış
Phone Farm Backup sistemi, sistem sağlığı, performans metriği ve işletimsel görünürlük için kapsamlı bir monitoring ve observability çerçevesi sunar. Sistem, geleneksel monitoring ile modern observability pratiklerini birleştirir.

## Mevcut Monitoring Kapasiteleri

### 1. Sağlık Kontrolleri (Health Checks)
- **Cihaz Seviyesi Sağlık**: Her bir Android cihazının bataryası, sıcaklığı, bellek kullanımı ve erişilebilirliği
- **Servis Seviyesi Sağlık**: API endpoint'lerinin yanıt verme durumu
- **Bağlantı Durumu**: ADB üzerinden cihaz bağlantı状态 monitoring

### 2. Metrik Toplama
- **Kuyruk Metrikleri**: Bekleyen, çalışan, tamamlanan ve başarısız iş sayısı
- **Cihaz Metrikleri**: Online/offline cihaz sayısı, bağlantı süresi
- **Görev Metrikleri**: Görev yürütme süresi, başarı/başarısız oranları, yeniden deneme sayıları

### 3. Günlük Kaydı (Logging)
- **Struktürlü Günlükler**: Loguru kullanılarak seviye ve kategori bazlı günlük kaydı
- **Hata İzleme**: İstisnalar ve hatalar detaylı stack trace ile kaydedilir
- **Operasyonel Günlükler**: Cihaz keşfi, görev kuyruk işlemleri, zamanlayıcı etkinlikleri

### 4. API ile Görselleştirme
- **RESTful Endpoints**: 
  - `/health` - Genel servis sağlığı
  - `/health/devices` - Tüm cihazların sağlık durumu
  - `/health/devices/{device_id}` - Belirli bir cihazın sağlık durumu
  - `/status` - Yönetici ve kuyruk durumu özeti
  - `/queue` - Tüm kuyruklu işler
  - `/queue/{job_id}` - Belirli bir işin durumu

## Observability İyileştirmeleri

### 1. Dağıtık İzleme (Distributed Tracing)
- **Trace ID Yayılımı**: Görev yürütme süreci boyunca trace ID'lerin taşınması
- **Span Oluşturma**: Her iş adımı (görev kuyruğundan alma, yürütme, tamamlanması) için span oluşturma
- **Gecikme Analizi**: Uçtan uca görev yürütme süresinin bileşenlerine ayrılması

### 2. Gelişmiş Metrikler
- **Prometheus Entegrasyonu**: 
  - Cihaz sağlık metriği (gauge)
  - Kuyruk uzunluğu ve işlem süresi (histogram)
  - Görev başarısı/başarısızlığı sayaçları
  - Sistem kaynak kullanımı (CPU, bellek, disk)
- **Özel Metrikler**:
  - Görev tipi başına yürütme sıklığı ve süresi
  - Cihaz modeli ve Android versiyonuna göre başarım farkları
  - Yeniden deneme dağılımı ve başarılı deneme oranı

### 3. Merkezi Günlük Yönetimi
- **JSON Formatlı Günlükler**: Parsenebilir yapıda günlük çıktısı
- **Günlük Seviyesi Sınıflandırması**: DEBUG, INFO, WARNING, ERROR, CRITICAL
- **Bağlam Zenginleştirmesi**: Cihaz ID'si, görev ID'si, çalışan iş parçacığı bilgisi
- **Dış Sistem Entegrasyonu**: ELK stack, Fluentd, veya benzeri sistemlerle entegrasyon

### 4. Alarm ve Bildirim Sistemi
- **Eşik Tabanlı Alarmlar**:
  - Cihaz sağlık skoru düşük olduğunda
  - Kuyruk gecikmesi belirli bir süreyi aştığında
  - Görev başarısızlığı oranı yüzde X'i geçtiğinde
  - Sistem kaynak kullanımı kritik seviyelere ulaştığında
- **Bildirim Kanalları**:
  - Email bildirimleri
  - Webhook entegrasyonları (Slack, Discord, vb.)
  - SMS acil durum bildirimleri
- **Alarm Düzenleme ve Susturma**:
  - Periyodik sorgulama ve alarm coalescing
  - Bakım pencereleri ve susturma profilleri

### 5. Görselleştirme Panoları
- **Gerçek Zamanlı Dashboard**:
  - Canlı cihaz durumu haritası
  - Görev işleme hızı ve kuyruk dinamiği
  - Sistem kaynak kullanım grafikleri
  - Başarım trendleri ve anomaly tespiti
- **Geçmiş Analiz**:
  - Günlük/haftalık/aylık raporlar
  - Başarım karşılaştırmaları ve trend analizi
  - Kapasite planlama ve kullanım tahmini

## Uygulama Önerileri

### Kısa Vadeli İyileştirmeler
1. Prometheus metrik endpoint'i ekleme (`/metrics`)
2. JSON formatlı günlük çıktısı yapılandırması
3. Temel alarm kuralları için yapılandırma dosyası
4. Günlük seviyesi kontrolü için ortam değişkeni desteği

### Orta Vadeli İyileştirmeleri
1. OpenTelemetry entegrasyonu ile dağıtık izleme
2. Görselleştirme için Grafana dashboard şablonları
3. Alarm yönetimi için Alertmanager veya benzeri entegrasyon
4. Görev örnekleme ve profileme araçları

### Uzun Vadeli Gelişmeler
1. Makine öğrenimi tabanlı anomali tespiti
2. Otomatik kapasite ölçeklendirme önerileri
3. Kök neden analizi (RCA) otomasyonu
4. Cross-correlation ile sistem etkileşimi analizi

## Güvenlik ve Gizlilik
- Hassas veri (giriş bilgileri, kişisel veri) günlüklerden hariç tutulmalı
- Erişim kontrolü ile metric ve log endpoint'lerinin korunması
- Audit trail için kritik işlemlerin güvenli kaydı
- Veri saklama politikaları ve şifreleme

## En İyi Uygulamalar
1. **Senkronizasyon**: Tüm zaman damgaları UTC ve ISO 8601 formatında
2. **Yeterlilik**: Sinyal/gürültü oranını optimize etmek için metrik granularitesi
3. **Tutarlılık**: Benzer varlıklar için standart metrik adları ve etiketleri
4. **Performans**: İzleme overhead'inin %5'i altında tutulması
5. **Geribildirim Döngüsü**: Observability verilerinin düzenli olarak sistem iyileştirmelerine kullanılması

## Başarım İzleme
- **APPLICATION_PERFORMANCE_INDEX (API)**: Görev başarı oranı, ortalama yürütme süresi, sistem kullanımının ağırlıklı kombinasi
- **DEVICE_HEALTH_SCORE**: Batarya, sıcaklık, bellek ve bağlantı skorunun ağırlıklı ortalaması
- **QUEUE_EFFICIENCY**: İşlem süresi / (kuyruk bekleme süresi + işlem süresi) oranı
- **SYSTEM_AVAILABILITY**: Planlı bakım dışı sistem çalışma süresi yüzdesi

Bu monitoring ve observability çerçevesi, Phone Farm Backup sisteminin güvenilirliğini, kullanılabilirliğini ve performansını sürekli olarak iyileştirmeyi sağlar.