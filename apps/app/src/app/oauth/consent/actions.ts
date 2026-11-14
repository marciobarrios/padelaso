"use server";

import { redirect } from "next/navigation";
import { isAllowedMcpClient, isAllowedMcpUser } from "@/lib/mcp/config";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { consentPath, isSafeClientRedirect, loginPath, parseAuthorizationId } from "./_lib";

/**
 * Records the user's decision with Supabase Auth and sends the browser back to
 * the OAuth client. Server Actions are callable directly, so every check the
 * page made is repeated here.
 */
export async function decideAuthorization(formData: FormData) {
  const authorizationId = parseAuthorizationId(formData.get("authorization_id"));
  const decision = formData.get("decision");
  if (!authorizationId || (decision !== "approve" && decision !== "deny")) {
    redirect("/oauth/consent?error=invalid");
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(loginPath(authorizationId));

  if (decision === "approve") {
    const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error || !details || !("authorization_id" in details)) redirect(consentPath(authorizationId));
    if (!isAllowedMcpUser(user.id) || !isAllowedMcpClient(details.client.id)) {
      redirect(consentPath(authorizationId));
    }
  }

  const options = { skipBrowserRedirect: true };
  const { data, error } = decision === "approve"
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, options)
    : await supabase.auth.oauth.denyAuthorization(authorizationId, options);
  if (error || !data || !isSafeClientRedirect(data.redirect_url)) {
    redirect("/oauth/consent?error=expired");
  }
  redirect(data.redirect_url);
}
