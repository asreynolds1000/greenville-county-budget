import { getServiceContext } from "@/lib/serviceContext";
import Link from "@/components/AppLink";

/**
 * A source-cited, FY-specific explanation for a supported entity.
 *
 * This is intentionally a Server Component. It reads authored context at build time and carries
 * no client interaction or generated-data contract; callers decide which entity-year page gives
 * it its surrounding accounting and provenance context.
 */
export function ServiceContext({ entityId, fiscalYear }: { entityId: string; fiscalYear: number }) {
  const context = getServiceContext(entityId, fiscalYear);
  if (!context) return null;

  return (
    <aside className="border-l-2 border-l-accent pl-4" aria-labelledby={`service-context-${entityId}`}>
      <h2 id={`service-context-${entityId}`} className="font-medium text-ink">{context.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{context.summary}</p>
      {context.changeNote && (
        <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
          <span className="font-medium text-ink">What the source says about change: </span>
          {context.changeNote}
        </p>
      )}
      <p className="mt-2 font-mono text-xs text-ink-secondary">
        <a
          href={context.source.href}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-accent"
        >
          {context.source.label}
        </a>
        {context.additionalSource && (
          <>
            <span> · </span>
            <a
              href={context.additionalSource.href}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-accent"
            >
              {context.additionalSource.label}
            </a>
          </>
        )}
      </p>
      {context.guide && (
        <p className="mt-3 text-sm">
          <Link
            href={context.guide.href}
            className="text-accent underline decoration-dotted underline-offset-2"
          >
            {context.guide.label}
          </Link>
        </p>
      )}
    </aside>
  );
}
