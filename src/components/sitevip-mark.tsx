/**
 * The siteVIP wordmark: "site" in ink, "VIP" in the field green, set in the display face.
 *
 * Words, not an image, exactly as designs/siteVIP Landing.dc.html draws it. `powered` adds the
 * "POWERED BY SPEC" line the landing page carries beside it.
 */
export function SiteVipMark({ size = 28, powered = false }: { size?: number; powered?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-2.5">
      <span className="font-serif leading-none text-ink" style={{ fontSize: size }}>
        site<span className="text-light-green">VIP</span>
      </span>
      {powered && (
        <span className="text-[12.5px] font-semibold tracking-[0.04em] text-ink-light">POWERED BY SPEC</span>
      )}
    </span>
  );
}
