const soap = require('soap');
const xml2js = require('xml2js');
require('dotenv').config();

const SMS_URL = process.env.SMS_URL;
const SMS_USERNAME = process.env.SMS_USERNAME ;
const SMS_PASSWORD = process.env.SMS_PASSWORD ;
const SMS_USER_CODE = parseInt(process.env.SMS_USER_CODE);
const SMS_ACCOUNT_ID = parseInt(process.env.SMS_ACCOUNT_ID);
const SMS_ORIGINATOR = process.env.SMS_ORIGINATOR;
const SMS_VALIDITY_PERIOD = parseInt(process.env.SMS_VALIDITY_PERIOD);
const SMS_BLACKLIST_CHECK = parseInt(process.env.SMS_BLACKLIST_CHECK) ;
const SMS_API_KEY = process.env.SMS_API_KEY;

console.log('📋 SMS Konfigürasyonu:');
console.log('URL:', SMS_URL);
console.log('Username:', SMS_USERNAME);
console.log('User Code:', SMS_USER_CODE);
console.log('Account ID:', SMS_ACCOUNT_ID);
console.log('Originator:', SMS_ORIGINATOR);

/**
 * PHP banaozelSmsGonder fonksiyonunun SOAP implementasyonu
 * @param {string} message - Gönderilecek mesaj
 * @param {array} receivers - Telefon numaraları listesi
 * @param {boolean} manyToMany - Çoktan çoğa gönderim
 * @returns {Promise<boolean>} - Başarı durumu
 */
async function banaozelSmsGonder(message = '', receivers = [], manyToMany = false) {
    const phones = [];
    const names = [];
    
    if (receivers.length > 0) {
        if (manyToMany === true) {
            Object.entries(receivers).forEach(([number, name]) => {
                phones.push(number);
                names.push(name);
            });
        } else {
            receivers.forEach(receiver => {
                phones.push(receiver);
            });
        }
    }

    // PHP'deki params array'i birebir aynı
    const params = {
        'Username': SMS_USERNAME,
        'Password': SMS_PASSWORD,
        'UserCode': SMS_USER_CODE,
        'AccountId': SMS_ACCOUNT_ID,
        'Originator': SMS_ORIGINATOR,
        'IsCheckBlackList': SMS_BLACKLIST_CHECK,
        'ValidityPeriod': SMS_VALIDITY_PERIOD,
        'SendDate': '',
        'MessageText': message,
        'ReceiverList': phones
    };

    if (manyToMany === true) {
        params['PersonalMessages'] = names;
    }

    // PHP'deki XML oluşturma mantığını birebir taklit et
    const requestXml = createPHPStyleXML(params);
    const Send = { 'requestXml': requestXml };

    try {
        // PHP: $soap = new SoapClient(SMS_URL, $options);
        const soap_client = await soap.createClientAsync(SMS_URL, {
            trace: true,
            wsdl_options: {
                timeout: 30000,
                rejectUnauthorized: false,
                strictSSL: false,
                secureProtocol: 'TLSv1_2_method'
            },
            stream_context: {
                http: {
                    protocol_version: 1.0
                }
            }
        });
        
        // PHP: $data = $soap->sendSms($Send);
        const result = await soap_client.sendSmsAsync(Send);
        
        // PHP: $result = isset($data->sendSmsResult->ErrorCode) && $data->sendSmsResult->ErrorCode == 0 ? true : false;
        let success = false;
        
        // Array response kontrolü
        if (result && Array.isArray(result) && result[0] && result[0].sendSmsResult) {
            const errorCode = result[0].sendSmsResult.ErrorCode;
            success = (errorCode === 0 || errorCode === '0');
            
            if (!success) {
                console.log('SMS Ana Servis Hatası:', {
                    ErrorCode: errorCode,
                    ErrorMessage: result[0].sendSmsResult.ErrorMessage || 'Bilinmeyen hata'
                });
            }
        } else if (result && result.sendSmsResult) {
            // Normal response kontrolü
            success = (result.sendSmsResult.ErrorCode === 0 || result.sendSmsResult.ErrorCode === '0');
            
            if (!success) {
                console.log('SMS Ana Servis Hatası:', {
                    ErrorCode: result.sendSmsResult.ErrorCode,
                    ErrorMessage: result.sendSmsResult.ErrorMessage || 'Bilinmeyen hata'
                });
            }
        } else {
            console.log('SMS Ana Servis - Beklenmeyen response yapısı:', result);
        }
        
        return success;
    } catch (e) {
        // PHP: } catch (Exception $e) { $data = $e; }
        console.log('SMS Ana Servis Exception:', e.message);
        return false;
    }
}

/**
 * PHP banaozelSmsGonderBACKUP fonksiyonunun SOAP implementasyonu
 * @param {string} mesaj - Gönderilecek mesaj
 * @param {array} tels - Telefon numaraları listesi
 * @returns {Promise<boolean|string>} - Başarı durumu veya hata mesajı
 */
async function banaozelSmsGonderBACKUP(mesaj, tels) {
    // PHP'deki sms array'i birebir aynı
    const sms = {
        'UserName': SMS_USERNAME,
        'Password': SMS_PASSWORD,
        'UserCode': SMS_USER_CODE.toString(),
        'ApiKey': SMS_API_KEY,
        'AccountID': SMS_ACCOUNT_ID.toString(),
        'Originator': SMS_ORIGINATOR,
        'SendDate': '',
        'ValidityPeriod': 120,
        'Title': 'Bana Özel',
        'TemplateText': mesaj,
        'GsmNumbers': JSON.stringify(tels),
        'ParametersForGsmNumbers': ''
    };
    
    try {
        // PHP: $client = new SoapClient($url);
        const client = await soap.createClientAsync(SMS_URL, {
            wsdl_options: {
                timeout: 30000,
                rejectUnauthorized: false,
                strictSSL: false,
                secureProtocol: 'TLSv1_2_method'
            }
        });
        
        // PHP: $send_sms = $client->SendSms([...])->SendSmsResult->any;
        // Node.js SOAP client'ta bu metod mevcut değil, alternatif metod kullanılacak
        const send_sms_result = await client.sendSmsAsync({
            requestXml: `<SendSms>
                <UserName>${sms['UserName']}</UserName>
                <Password>${sms['Password']}</Password>
                <UserCode>${sms['UserCode']}</UserCode>
                <ApiKey>${sms['ApiKey']}</ApiKey>
                <AccountID>${sms['AccountID']}</AccountID>
                <Originator>${sms['Originator']}</Originator>
                <SendDate>${sms['SendDate']}</SendDate>
                <ValidityPeriod>${sms['ValidityPeriod']}</ValidityPeriod>
                <Title>${sms['Title']}</Title>
                <TemplateText>${sms['TemplateText']}</TemplateText>
                <GsmNumbers>${sms['GsmNumbers']}</GsmNumbers>
                <ParametersForGsmNumbers>${sms['ParametersForGsmNumbers']}</ParametersForGsmNumbers>
            </SendSms>`
        });
        
        // PHP: $send_sms_response_xml = simplexml_load_string($send_sms);
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
        
        let send_sms_response_xml;
        try {
            // SOAP response'u direkt kontrol et
            if (send_sms_result && send_sms_result[0] && send_sms_result[0].sendSmsResult) {
                const errorCode = send_sms_result[0].sendSmsResult.ErrorCode;
                console.log('BACKUP SMS - Direct ErrorCode:', errorCode);
                
                // ErrorCode -8 ise başarısız
                if (errorCode && errorCode !== 0 && errorCode !== '0') {
                    return `SMS Error Code: ${errorCode}`;
                }
                
                // Başarılı ise true döndür
                if (errorCode === 0 || errorCode === '0') {
                    return true;
                }
            }
            
            // XML parsing için fallback
            const xmlString = send_sms_result?.sendSmsResult?.any || send_sms_result?.[0]?.sendSmsResult?.any;
            if (!xmlString) {
                console.log('BACKUP SMS - sendSmsResult:', send_sms_result);
                return 'SendSms XML response bulunamadı';
            }
            
            send_sms_response_xml = await new Promise((resolve, reject) => {
                parser.parseString(xmlString, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        } catch (xmlError) {
            console.error('BACKUP SMS - XML parsing error:', xmlError.message);
            return 'SendSms XML response parse edilemedi';
        }
        
        // PHP: if ($send_sms_response_xml->RESULT_STATUS->CODE == '56')
        const resultCode = send_sms_response_xml?.RESULT_STATUS?.CODE;
        
        if (resultCode === '56') {
            // PHP: $confirm_sms = $client->ConfirmSmsTransaction([...])->ConfirmSmsTransactionResult->any;
            const transactionId = send_sms_response_xml?.TRANSACTION_STATUS?.TRANSACTION_ID;
            
            if (!transactionId) {
                console.log('BACKUP SMS - Transaction ID bulunamadı');
                return 'Transaction ID bulunamadı';
            }
            
            const confirm_sms_result = await client.confirmSmsAsync({
                requestXml: `<ConfirmSms>
                    <UserName>${sms['UserName']}</UserName>
                    <Password>${sms['Password']}</Password>
                    <UserCode>${sms['UserCode']}</UserCode>
                    <TransactionID>${transactionId}</TransactionID>
                </ConfirmSms>`
            });
            
            // PHP: $confirm_sms_response_xml = simplexml_load_string($confirm_sms);
            let confirm_sms_response_xml;
            try {
                const confirmXmlString = confirm_sms_result?.confirmSmsResult?.any || confirm_sms_result?.[0]?.confirmSmsResult?.any;
                if (!confirmXmlString) {
                    console.log('BACKUP SMS - confirmSmsResult:', confirm_sms_result);
                    throw new Error('ConfirmSms XML response bulunamadı');
                }
                
                confirm_sms_response_xml = await new Promise((resolve, reject) => {
                    parser.parseString(confirmXmlString, (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                });
            } catch (xmlError) {
                console.error('BACKUP SMS - Confirm XML parsing error:', xmlError.message);
                throw new Error('ConfirmSms XML response parse edilemedi');
            }
            
            // PHP: if ($confirm_sms_response_xml->RESULT_STATUS->CODE == '56')
            const confirmResultCode = confirm_sms_response_xml?.RESULT_STATUS?.CODE;
            
            if (confirmResultCode === '56') {
                return true;
            } else {
                // PHP: return $confirm_sms_response_xml->RESULT_STATUS->DESC;
                return confirm_sms_response_xml?.RESULT_STATUS?.DESC || 'Confirm SMS hatası';
            }
        } else {
            // PHP: return $send_sms_response_xml->RESULT_STATUS->DESC;
            return send_sms_response_xml?.RESULT_STATUS?.DESC || `SMS Error Code: ${resultCode}`;
        }
        
    } catch (error) {
        console.error('BACKUP SMS Error:', error.message);
        return error.message;
    }
}

/**
 * PHP'deki XML oluşturma mantığını birebir taklit eder
 * PHP SimpleXMLElement'in iki foreach döngüsünü tam taklit eder
 */
function createPHPStyleXML(params) {
    let xml = '<SendSms>';
    
    // İlk foreach döngüsü - PHP: foreach ($params as $Key => $Value)
    // in_array($Key, ['ReceiverList']) kontrolü ile ReceiverList özel işlenir
    Object.entries(params).forEach(([Key, Value]) => {
        if (Key === 'ReceiverList') {
            // PHP: $ReceiverList = $SendSms->addChild('ReceiverList');
            xml += '<ReceiverList>';
            if (Array.isArray(Value)) {
                Value.forEach(Gsm => {
                    // PHP: $ReceiverList->addChild('Receiver', $Gsm);
                    xml += `<Receiver>${xmlEscape(Gsm)}</Receiver>`;
                });
            }
            xml += '</ReceiverList>';
        } else {
            // PHP: $SendSms->addChild($Key, $Value);
            xml += `<${Key}>${xmlEscape(Value)}</${Key}>`;
        }
    });
    
    // İkinci foreach döngüsü - sadece PersonalMessages için (PHP'deki şart)
    Object.entries(params).forEach(([Key, Value]) => {
        if (Key === 'PersonalMessages') {
            xml += '<PersonalMessages>';
            if (Array.isArray(Value)) {
                Value.forEach(tmp2 => {
                    xml += '<PersonalMessage>';
                    xml += `<Parameter>${xmlEscape(tmp2)}</Parameter>`;
                    xml += '</PersonalMessage>';
                });
            }
            xml += '</PersonalMessages>';
        }
    });
    
    xml += '</SendSms>';
    
    // PHP: str_replace('<?xml version="1.0"?>', '', trim($SendSms->asXML()))
    return xml.replace('<?xml version="1.0"?>', '').trim();
}

/**
 * XML'e gömülecek metinler için özel karakter kaçışları uygular
 */
function xmlEscape(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Telefon numarasını temizle ve normalize et
 */
function cleanPhoneNumber(phone) {
    if (!phone) return null;
    
    // Boşlukları ve özel karakterleri temizle
    let cleaned = phone.toString().replace(/[\s\(\)\-\.]/g, '');
    
    // Türkiye formatına çevir
    if (cleaned.startsWith('+90')) {
        cleaned = cleaned.substring(3);
    } else if (cleaned.startsWith('90')) {
        cleaned = cleaned.substring(2);
    }
    
    // 0 ile başlamıyorsa ekle
    if (!cleaned.startsWith('0') && cleaned.length === 10) {
        cleaned = '0' + cleaned;
    }
    
    // 11 haneli olmalı ve 0 ile başlamalı
    if (cleaned.length === 11 && cleaned.startsWith('0')) {
        return cleaned;
    }
    
    return null;
}

/**
 * Ana SMS gönderim fonksiyonu
 */
async function sendSMS(phone, message) {
    try {
        // Telefon numarasını temizle
        const cleanedPhone = cleanPhoneNumber(phone);
        if (!cleanedPhone) {
            return {
                success: false,
                phone: phone,
                error: 'Geçersiz telefon numarası formatı'
            };
        }
        
        // Mesajı kontrol et
        if (!message || message.trim().length === 0) {
            return {
                success: false,
                phone: cleanedPhone,
                error: 'Mesaj içeriği boş olamaz'
            };
        }
        
        console.log(`📱 SMS gönderiliyor: ${cleanedPhone} - Mesaj: ${message}`);
        
        // Önce ana SMS servisini dene
        const mainResult = await banaozelSmsGonder(message, [cleanedPhone]);
        
        if (mainResult === true) {
            console.log('✅ Ana SMS servisi başarılı:', cleanedPhone);
            return {
                success: true,
                phone: cleanedPhone,
                service: 'main'
            };
        }
        
        // Ana servis başarısız ise backup'ı dene
        console.log('⚠️ Ana SMS servisi başarısız, BACKUP deneniyor:', cleanedPhone);
        
        const backupResult = await banaozelSmsGonderBACKUP(message, [cleanedPhone]);
        
        if (backupResult === true) {
            console.log('✅ BACKUP SMS servisi başarılı:', cleanedPhone);
            return {
                success: true,
                phone: cleanedPhone,
                service: 'backup'
            };
        }
        
        // Her iki servis de başarısız
        const errorMessage = typeof backupResult === 'string' ? backupResult : 'SMS gönderilemedi';
        console.log(`❌ SMS gönderilemedi: ${cleanedPhone} - Hata: ${errorMessage}`);
        
        return {
            success: false,
            phone: cleanedPhone,
            error: errorMessage
        };
        
    } catch (error) {
        console.error('SMS gönderim hatası:', error.message);
        return {
            success: false,
            phone: phone,
            error: error.message
        };
    }
}

module.exports = {
    sendSMS,
    banaozelSmsGonder,
    banaozelSmsGonderBACKUP,
    cleanPhoneNumber
};