import type { ReactNode } from "react";
import { signInUrl } from "@/lib/storyblok/urls";

export function Notice({ title, children, signIn }: { title: string; children: ReactNode; signIn?: boolean }) {
  return (
    <main className="notice-page">
      <section className="notice-card" role="status">
        <h1>{title}</h1>
        <p>{children}</p>
        <div className="notice-actions">
          <a className="button-link" href="">
            Try again
          </a>
          {signIn && (
            <a className="button-link" data-variant="solid" href={signInUrl}>
              Sign in again
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
