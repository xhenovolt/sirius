/**
 * "Jipra Classic": the pink fees-clearance card of Jinja Progressive Secondary
 * School, expressed as a template. The card designer will read and write this
 * exact shape, so keep the preset and the editor on one schema.
 *
 * Coordinates are design units on a 1110 x 570 face (about 1.95 : 1).
 *
 * Deliberate differences from the paper card:
 *  - "Fees Balance" is hidden (visible:false). A printed balance goes stale the
 *    moment a payment is made. The live balance and clearance verdict live
 *    behind the QR instead.
 *  - The blue rubber-stamp area is kept as a non-printing guide so schools
 *    that still stamp by hand have their space.
 *  - A QR is added. It is required on every template.
 */

const bold = { bold: true, fontSize: 20 };

export const jipraClassic = {
  schemaVersion: 1,
  id: 'jipra-classic',
  name: 'Jipra Classic',
  size: { w: 1110, h: 570 },
  physical: { wMm: 107, hMm: 55 }, // measure the real card and correct this
  // Set print:false when printing on pre-coloured pink stock.
  background: { color: '#f7c1d3', print: true },
  elements: [
    {
      id: 'logo',
      type: 'image',
      x: 775, y: 25, w: 165, h: 165, z: 1,
      src: null, placeholder: 'logo', alt: 'School crest',
      style: { fit: 'contain' },
    },
    {
      id: 'school-name',
      type: 'text',
      x: 375, y: 24, w: 380, h: 80, z: 2,
      content: '{{school.name}}',
      style: { fontSize: 27, bold: true, underline: true, uppercase: true, align: 'center', lineHeight: 1.25 },
    },
    {
      id: 'term',
      type: 'text',
      x: 375, y: 110, w: 380, h: 30, z: 2,
      content: '|{{term.academic_year}} ({{term.name}}) TERM|',
      style: { fontSize: 23, bold: true, align: 'center' },
    },
    {
      id: 'tel',
      type: 'text',
      x: 360, y: 166, w: 400, h: 28, z: 2,
      content: 'Tel: {{school.tel}}',
      style: { fontSize: 21, bold: true, align: 'center' },
    },
    {
      id: 'title',
      type: 'text',
      x: 375, y: 204, w: 380, h: 32, z: 2,
      content: 'FEES CLEARANCE CARD',
      style: { fontSize: 23, bold: true, underline: true, align: 'center' },
    },
    {
      id: 'student-name',
      type: 'text',
      x: 600, y: 247, w: 220, h: 30, z: 2,
      content: '{{student.full_name}}',
      style: { fontSize: 23, bold: true, uppercase: true },
    },
    {
      id: 'photo',
      type: 'image',
      x: 80, y: 40, w: 180, h: 190, z: 1,
      bind: 'student.photo_url', placeholder: 'photo', alt: 'Student photo',
      style: { fit: 'cover' },
    },
    {
      id: 'account-no',
      type: 'text',
      x: 77, y: 262, w: 120, h: 28, z: 2,
      content: '{{student.account_no}}',
      style: { ...bold, align: 'center' },
    },
    {
      id: 'class',
      type: 'text',
      x: 208, y: 262, w: 120, h: 28, z: 2,
      content: '{{student.class}}',
      style: { ...bold, align: 'center' },
    },
    {
      id: 'stream',
      type: 'text',
      x: 322, y: 262, w: 120, h: 28, z: 2,
      content: '{{student.stream}}',
      style: { ...bold, align: 'center' },
    },
    {
      id: 'label-type',
      type: 'text',
      x: 48, y: 322, w: 90, h: 28, z: 2,
      content: 'Type',
      style: { fontSize: 21, bold: true },
    },
    {
      id: 'value-type',
      type: 'text',
      x: 300, y: 322, w: 120, h: 28, z: 2,
      content: '{{student.type}}',
      style: { ...bold, align: 'center' },
    },
    {
      id: 'label-fees',
      type: 'text',
      x: 48, y: 380, w: 160, h: 28, z: 2,
      content: 'Fees Balance',
      visible: false, sensitive: true,
      style: { fontSize: 21, bold: true },
    },
    {
      id: 'value-fees',
      type: 'text',
      x: 300, y: 380, w: 120, h: 28, z: 2,
      content: '{{student.fees_balance}}',
      visible: false, sensitive: true,
      style: { ...bold, align: 'center' },
    },
    {
      id: 'label-sign',
      type: 'text',
      x: 48, y: 468, w: 70, h: 28, z: 2,
      content: 'Sign:',
      style: { fontSize: 21, bold: true },
    },
    {
      id: 'line-sign',
      type: 'line',
      x: 112, y: 492, w: 230, h: 0, z: 2,
      style: { thickness: 2, dash: 'dotted', color: '#141414' },
    },
    {
      id: 'accounts-dept',
      type: 'text',
      x: 590, y: 405, w: 220, h: 28, z: 2,
      content: '(Accounts Dept.)',
      style: { fontSize: 20, bold: true, align: 'center' },
    },
    {
      id: 'qr',
      type: 'qr',
      x: 835, y: 215, w: 190, h: 190, z: 3,
      required: true, locked: true,
    },
    {
      id: 'qr-caption',
      type: 'text',
      x: 835, y: 410, w: 190, h: 24, z: 2,
      content: 'Scan to verify',
      style: { fontSize: 17, bold: true, align: 'center' },
    },
    {
      id: 'issued-on',
      type: 'text',
      x: 960, y: 445, w: 130, h: 28, z: 2,
      content: '{{issued_on}}',
      style: { fontSize: 19, bold: true, align: 'right' },
    },
    {
      id: 'stamp-zone',
      type: 'stampZone',
      x: 125, y: 268, w: 395, h: 258, z: 0,
      label: 'Stamp area (not printed)', print: false,
    },
  ],
};

/** Synthetic data only. Never commit real learners' names, photos or phones. */
export const sampleData = {
  school: {
    name: 'Jinja Progressive Secondary School',
    tel: '(0)702-000000 / (0)772-000000',
  },
  term: { academic_year: 2026, name: 'THIRD' },
  student: {
    full_name: 'Sample Student',
    account_no: '05-00000',
    class: 'S5',
    stream: 'A',
    type: 'DAY',
    photo_url: null,
  },
  issued_on: '11 Oct 2026',
};
