/**
 * @file CreditsBadge.tsx
 * @description Liten pill som visar AI-kreditsaldot. Klick öppnar
 * köpdialogen.
 */

import { useState } from "react";
import type { User } from "firebase/auth";
import { useCredits } from "../../lib/useCredits";
import { BuyCreditsDialog } from "./BuyCreditsDialog";
import { useT } from "./i18n";

export function CreditsBadge({ user }: { user: User }) {
  const t = useT();
  const credits = useCredits(user.uid);
  const [showBuy, setShowBuy] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowBuy(true)}
        className="text-xs border border-rule text-text-warm bg-white px-3 py-1.5 rounded-full hover:border-green-dark transition"
        title={t("Köp fler AI-krediter", "Buy more AI credits")}
      >
        ✨ {credits === null ? "…" : credits} {t("AI-krediter", "AI credits")}
      </button>
      {showBuy && <BuyCreditsDialog onClose={() => setShowBuy(false)} />}
    </>
  );
}
