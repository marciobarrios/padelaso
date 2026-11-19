"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

/**
 * The app's Integraciones settings link to these guides with `?from=app`.
 * Only that flag is read, never a URL, so the return destination is fixed
 * here and cannot be pointed elsewhere (no open redirect).
 */
const APP_SETTINGS_URL = "https://app.padelaso.com/settings";

function useFromApp() {
  return useSearchParams().get("from") === "app";
}

type LinkProps = { className: string; children: ReactNode };

function BackLinkInner({ className, children }: LinkProps) {
  if (useFromApp()) return <a href={APP_SETTINGS_URL} className={className}>{children}</a>;
  return <Link href="/" className={className}>{children}</Link>;
}

/** Back link: to the app's settings when the visitor came from the app, else to the home page. */
export function BackLink(props: LinkProps) {
  return (
    <Suspense fallback={<Link href="/" className={props.className}>{props.children}</Link>}>
      <BackLinkInner {...props} />
    </Suspense>
  );
}

function GuideLinkInner({ href, className, children }: LinkProps & { href: string }) {
  return <Link href={useFromApp() ? `${href}?from=app` : href} className={className}>{children}</Link>;
}

/** Link between guide pages that keeps the `from=app` flag. */
export function GuideLink(props: LinkProps & { href: string }) {
  return (
    <Suspense fallback={<Link href={props.href} className={props.className}>{props.children}</Link>}>
      <GuideLinkInner {...props} />
    </Suspense>
  );
}
