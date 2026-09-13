/**
 * What is actually running right now — pure, no I/O.
 *
 * The cockpit answers "is the business working". This answers the question underneath it, which
 * nobody could answer without opening a dashboard: **is the thing I am looking at the thing that
 * was built?**
 *
 * It matters more here than in most products. Work gets done in one place and deployed from
 * another, and for months this project shipped changes that never actually reached production —
 * builds went green, deploys succeeded, and the live site stayed where it was. The owner had no way
 * to see that without reading a build log. Now the running version says what it is, on the page he
 * already opens.
 *
 * Everything comes from the variables the platform sets on its own. Nothing to configure, which is
 * the point: a panel that needs a setting is a panel that will one day be blank and nobody will
 * know why.
 */

export interface Running {
  /** The first line of the commit message — what was actually changed. */
  what: string | null;
  /** Short commit hash, for looking it up. */
  ref: string | null;
  /** production | preview | development, as the platform reports it. */
  where: string;
  /** True when this is the real thing rather than a preview or a laptop. */
  live: boolean;
  /** Whose commit it was. */
  by: string | null;
  /** A link to the exact commit, when the repository is known. */
  href: string | null;
}

interface Env { [key: string]: string | undefined }

/** First line only. A commit body is paragraphs, and this is one line on a card. */
const firstLine = (s: string | undefined): string | null => {
  const line = (s ?? '').split('\n')[0].trim();
  return line ? line.slice(0, 140) : null;
};

export function running(env: Env): Running {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim() || null;
  const owner = env.VERCEL_GIT_REPO_OWNER?.trim();
  const repo = env.VERCEL_GIT_REPO_SLUG?.trim();

  return {
    what: firstLine(env.VERCEL_GIT_COMMIT_MESSAGE),
    ref: sha ? sha.slice(0, 7) : null,
    where: env.VERCEL_ENV?.trim() || 'development',
    live: env.VERCEL_ENV?.trim() === 'production',
    by: env.VERCEL_GIT_COMMIT_AUTHOR_NAME?.trim() || null,
    href: sha && owner && repo ? `https://github.com/${owner}/${repo}/commit/${sha}` : null,
  };
}

/**
 * One sentence, for somebody who does not read commit logs.
 *
 * Says plainly when it cannot tell, rather than implying everything is fine. Running locally is not
 * a fault and does not read like one — but it is also not evidence about the live site, and the
 * difference is the whole reason this exists.
 */
export function runningLine(r: Running): string {
  if (!r.ref) {
    return 'This copy was not built from a commit, so it cannot say which version it is. That is normal on a laptop and never true of the live site.';
  }
  if (!r.live) {
    return `A ${r.where} build, not the live site. Whatever it shows is about this copy only.`;
  }
  return 'This is the live site, and the change below is what it is running.';
}
