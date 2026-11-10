import styles from './ClearanceCard.module.css';

/**
 * ClearanceCard — the ONE renderer used by the designer canvas, the preview
 * route and print/PDF. It draws a template (plain JSON) with real data.
 *
 * Template coordinates are "design units" (e.g. 1110 x 570). Every position
 * becomes a percentage and every font size becomes a container-query unit
 * (cqw), so the card scales perfectly to any width: a phone, a 4K monitor or
 * 107 mm on paper.
 *
 * The QR is never built here. The server passes `qrSrc` (a data URL) that
 * encodes ${APP_BASE_URL}/v/{opaque_token}. A template cannot change it.
 */

const SERIF = '"Times New Roman", "Liberation Serif", Times, serif';

/** Read "student.full_name" from a nested object. */
export function getPath(obj, path) {
  return String(path)
    .split('.')
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Replace {{school.name}}-style merge fields. Unknown fields render empty. */
export function resolveMerge(text, data) {
  return String(text ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = getPath(data, path);
    return value == null ? '' : String(value);
  });
}

const pct = (n, total) => `${(n / total) * 100}%`;
const cqw = (n, total) => `${(n / total) * 100}cqw`;

const V_ALIGN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

function PhotoPlaceholder() {
  return (
    <svg viewBox="0 0 100 100" className={styles.fill} aria-hidden="true">
      <rect width="100" height="100" fill="#9fc3ea" />
      <circle cx="50" cy="38" r="17" fill="#6d8fb8" />
      <path d="M12 100c2-24 18-34 38-34s36 10 38 34z" fill="#6d8fb8" />
    </svg>
  );
}

function LogoPlaceholder() {
  return (
    <svg viewBox="0 0 100 100" className={styles.fill} aria-hidden="true">
      <path
        d="M50 6 88 20v32c0 24-16 38-38 44C28 90 12 76 12 52V20z"
        fill="none"
        stroke="#141414"
        strokeWidth="3"
      />
      <path d="M50 6v90M12 40h76" stroke="#141414" strokeWidth="2" />
    </svg>
  );
}

function QrPlaceholder() {
  return (
    <svg viewBox="0 0 29 29" className={styles.fill} aria-hidden="true">
      <rect width="29" height="29" fill="#fff" />
      {[
        [1, 1],
        [20, 1],
        [1, 20],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="8" height="8" fill="#141414" />
          <rect x={x + 1} y={y + 1} width="6" height="6" fill="#fff" />
          <rect x={x + 2} y={y + 2} width="4" height="4" fill="#141414" />
        </g>
      ))}
      <path
        d="M11 2h2v2h-2zM14 5h3v2h-3zM11 9h5v2h-5zM18 10h4v3h-4zM3 12h4v2H3zM9 14h3v4H9zM14 14h2v3h-2zM19 15h3v2h-3zM24 12h3v3h-3zM12 20h3v3h-3zM17 21h3v4h-3zM22 20h4v2h-4zM12 25h3v2h-3zM23 25h3v2h-3z"
        fill="#141414"
      />
    </svg>
  );
}

function Element({ el, W, H, data, qrSrc }) {
  const style = el.style || {};
  const box = {
    left: pct(el.x, W),
    top: pct(el.y, H),
    width: pct(el.w, W),
    height: pct(el.h, H),
    transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined,
  };

  switch (el.type) {
    case 'text': {
      const text = resolveMerge(el.content, data);
      return (
        <div
          className={`${styles.el} ${styles.text}`}
          style={{
            ...box,
            justifyContent: V_ALIGN[style.vAlign || 'top'],
            fontFamily: style.fontFamily || SERIF,
            fontSize: cqw(style.fontSize || 20, W),
            fontWeight: style.bold ? 700 : 400,
            fontStyle: style.italic ? 'italic' : 'normal',
            textDecoration: style.underline ? 'underline' : 'none',
            textTransform: style.uppercase ? 'uppercase' : 'none',
            textAlign: style.align || 'left',
            lineHeight: style.lineHeight || 1.2,
            letterSpacing: style.letterSpacing ? cqw(style.letterSpacing, W) : undefined,
            color: style.color || '#141414',
          }}
        >
          <div>{text}</div>
        </div>
      );
    }

    case 'image': {
      const src = el.bind ? getPath(data, el.bind) : el.src;
      return (
        <div className={`${styles.el} ${styles.image}`} style={box}>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={el.alt || ''} style={{ objectFit: style.fit || 'cover' }} />
          ) : el.placeholder === 'logo' ? (
            <LogoPlaceholder />
          ) : (
            <PhotoPlaceholder />
          )}
        </div>
      );
    }

    case 'qr':
      return (
        <div className={`${styles.el} ${styles.qr}`} style={box}>
          {qrSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrSrc} alt="QR code: scan to verify this card" />
          ) : (
            <QrPlaceholder />
          )}
        </div>
      );

    case 'line':
      return (
        <div
          className={styles.el}
          style={{
            ...box,
            height: 0,
            borderTop: `${cqw(style.thickness || 2, W)} ${style.dash || 'solid'} ${
              style.color || '#141414'
            }`,
          }}
        />
      );

    case 'shape':
      return (
        <div
          className={styles.el}
          style={{
            ...box,
            background: style.fill || 'transparent',
            border: style.stroke
              ? `${cqw(style.strokeWidth || 2, W)} solid ${style.stroke}`
              : undefined,
            borderRadius: style.radius ? cqw(style.radius, W) : undefined,
          }}
        />
      );

    case 'stampZone':
      // Guide only. Marked print:false in the template, so it is hidden in print.
      return (
        <div className={`${styles.el} ${styles.guide}`} style={{ ...box, fontSize: cqw(18, W) }}>
          {el.label || 'Stamp area'}
        </div>
      );

    default:
      return null;
  }
}

export default function ClearanceCard({
  template,
  data = {},
  qrSrc = null,
  showGuides = false,
  width = '100%',
  className = '',
}) {
  const { size, background, elements } = template;
  const { w: W, h: H } = size;

  const items = elements
    .filter((el) => el.visible !== false)
    .filter((el) => showGuides || el.print !== false)
    .sort((a, b) => (a.z || 0) - (b.z || 0));

  return (
    <div
      className={`${styles.card} ${className}`}
      style={{
        width,
        aspectRatio: `${W} / ${H}`,
        background: background?.print === false ? 'transparent' : background?.color,
      }}
      role="group"
      aria-label={template.name}
    >
      {items.map((el) => (
        <Element key={el.id} el={el} W={W} H={H} data={data} qrSrc={qrSrc} />
      ))}
    </div>
  );
}
