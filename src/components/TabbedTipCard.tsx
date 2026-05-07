"use client";

import { useState } from "react";
import { StripeDonateCard } from "./StripeDonateCard";
import { LightningCard } from "./LightningCard";

type Tab = "fiat" | "lightning";

type TabbedTipCardProps = {
  lightningAddress: string;
};

export function TabbedTipCard({ lightningAddress }: TabbedTipCardProps) {
  const [active, setActive] = useState<Tab>("fiat");

  return (
    <div className="bg-surface border border-border relative max-w-xl mx-auto">
      {/* Cat-eye corner ornaments */}
      <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye" />
      <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye" />
      <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye" />
      <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye" />

      {/* Tab strip */}
      <div className="flex border-b border-rule" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={active === "fiat"}
          aria-controls="tip-panel-fiat"
          id="tip-tab-fiat"
          onClick={() => setActive("fiat")}
          className={`tip-tab${active === "fiat" ? " tip-tab-active" : ""}`}
        >
          Fiat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === "lightning"}
          aria-controls="tip-panel-lightning"
          id="tip-tab-lightning"
          onClick={() => setActive("lightning")}
          className={`tip-tab${
            active === "lightning" ? " tip-tab-active" : ""
          }`}
        >
          Lightning
        </button>
      </div>

      {/* Tab panel */}
      <div className="p-8 md:p-10">
        <div
          role="tabpanel"
          id="tip-panel-fiat"
          aria-labelledby="tip-tab-fiat"
          hidden={active !== "fiat"}
        >
          {active === "fiat" && <StripeDonateCard />}
        </div>
        <div
          role="tabpanel"
          id="tip-panel-lightning"
          aria-labelledby="tip-tab-lightning"
          hidden={active !== "lightning"}
        >
          {active === "lightning" && (
            <LightningCard lightningAddress={lightningAddress} />
          )}
        </div>
      </div>
    </div>
  );
}
