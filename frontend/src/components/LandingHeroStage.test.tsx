import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { LandingHeroStage } from "./LandingHeroStage";

describe("LandingHeroStage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("animates the first signed-out landing page visit in the current tab", async () => {
    render(
      <LandingHeroStage animateOnFirstVisit>
        <span>Hero content</span>
      </LandingHeroStage>,
    );

    await waitFor(() => {
      expect(screen.getByText("Hero content").parentElement?.className).toContain("heroStageIntro");
    });
    expect(window.sessionStorage.getItem("carecall:landing-intro-seen")).toBe("true");
  });

  it("does not animate again after the intro has already been seen", async () => {
    window.sessionStorage.setItem("carecall:landing-intro-seen", "true");

    render(
      <LandingHeroStage animateOnFirstVisit>
        <span>Hero content</span>
      </LandingHeroStage>,
    );

    await waitFor(() => {
      expect(screen.getByText("Hero content").parentElement?.className).not.toContain("heroStageIntro");
    });
  });

  it("does not animate the signed-in dashboard landing state", async () => {
    render(
      <LandingHeroStage animateOnFirstVisit={false}>
        <span>Hero content</span>
      </LandingHeroStage>,
    );

    await waitFor(() => {
      expect(screen.getByText("Hero content").parentElement?.className).not.toContain("heroStageIntro");
    });
    expect(window.sessionStorage.getItem("carecall:landing-intro-seen")).toBeNull();
  });

  it("updates and resets magnetic cursor variables", () => {
    render(
      <LandingHeroStage animateOnFirstVisit={false}>
        <span className="sloganWord seen">Care seen</span>
        <span className="sloganWord heard">Needs heard</span>
        <span className="sloganWord delivered">Help delivered</span>
        <span className="logoStage">Logo</span>
      </LandingHeroStage>,
    );

    const stage = screen.getByText("Care seen").parentElement as HTMLDivElement;
    const seen = screen.getByText("Care seen") as HTMLElement;
    const heard = screen.getByText("Needs heard") as HTMLElement;
    const delivered = screen.getByText("Help delivered") as HTMLElement;
    const logo = screen.getByText("Logo") as HTMLElement;

    seen.getBoundingClientRect = () => rect(40, 40, 120, 40);
    heard.getBoundingClientRect = () => rect(210, 40, 130, 40);
    delivered.getBoundingClientRect = () => rect(390, 40, 150, 40);
    logo.getBoundingClientRect = () => rect(190, 120, 180, 180);

    fireEvent.pointerMove(stage, { clientX: 250, clientY: 80 });

    expect(seen.style.getPropertyValue("--magnet-x")).toBe("4.36px");
    expect(heard.style.getPropertyValue("--magnet-x")).toBe("-3.49px");
    expect(delivered.style.getPropertyValue("--magnet-x")).toBe("-0.33px");
    expect(logo.style.getPropertyValue("--magnet-y")).toBe("-7.99px");

    fireEvent.pointerLeave(stage);

    [seen, heard, delivered, logo].forEach((element) => {
      expect(element.style.getPropertyValue("--magnet-x")).toBe("0.00px");
      expect(element.style.getPropertyValue("--magnet-y")).toBe("0.00px");
    });
  });
});

function rect(left: number, top: number, width: number, height: number) {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => "",
  };
}
