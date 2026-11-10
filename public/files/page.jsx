import QRCode from 'qrcode'; // npm i qrcode
import ClearanceCard from '../../../components/cards/ClearanceCard';
import { jipraClassic, sampleData } from '../../../components/cards/jipraClassic.template';

export const metadata = { title: 'Card preview · Sirius' };

export default async function CardPreviewPage() {
  // In production the token comes from qr_identities and the base URL from
  // APP_BASE_URL. This sample token resolves to nothing.
  const base = process.env.APP_BASE_URL || 'https://sirius.example';
  const qrSrc = await QRCode.toDataURL(`${base}/v/SAMPLE-TOKEN`, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 480,
  });

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 64px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Jipra Classic</h1>
      <p style={{ margin: '0 0 24px', color: '#555' }}>
        Printed face with sample data. The QR links to the live record.
      </p>

      <ClearanceCard template={jipraClassic} data={sampleData} qrSrc={qrSrc} />

      <h2 style={{ fontSize: 16, margin: '40px 0 4px' }}>Editor view</h2>
      <p style={{ margin: '0 0 16px', color: '#555' }}>
        Same renderer with guides on. The stamp area shows here and never prints.
      </p>

      <ClearanceCard template={jipraClassic} data={sampleData} qrSrc={qrSrc} showGuides />
    </main>
  );
}
