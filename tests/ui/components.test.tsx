// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CompareSlider } from "@/components/comparison/compare-slider";
import { MoodPicker } from "@/components/moods/mood-picker";
import { Dropzone } from "@/components/upload/dropzone";

describe("MoodPicker", () => {
  it("offers the five worlds as a labelled radio group", async () => {
    const onChange = vi.fn();
    render(<MoodPicker value={null} onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Choose a world" })).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => (radio as HTMLInputElement).value)).toEqual(["golden", "after-rain", "old-soul", "daydream"]);
    await userEvent.click(screen.getByLabelText(/After Rain/));
    expect(onChange).toHaveBeenCalledWith("after-rain");
  });

  it("shows the selection with a text label, not colour alone", () => {
    render(<MoodPicker value="daydream" onChange={() => undefined} />);
    expect(screen.getByRole("radio", { name: /Daydream/ })).toBeChecked();
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });
});

describe("CompareSlider", () => {
  it("is a keyboard-operable slider with both images labelled", async () => {
    render(<CompareSlider beforeUrl="blob:a" afterUrl="blob:b" beforeAlt="Original photo" afterAlt="Reimagined photo" afterLabel="Reimagined in Golden" aspectRatio={1.5} />);
    const slider = screen.getByRole("slider", { name: "Compare original and reimagined" });
    expect(slider).toHaveAttribute("aria-valuenow", "50");
    slider.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "54");
    await userEvent.keyboard("{Home}");
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    await userEvent.keyboard("{End}");
    expect(slider).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByAltText("Original photo")).toBeInTheDocument();
    expect(screen.getByText("Reimagined in Golden")).toBeInTheDocument();
  });
});

describe("Dropzone", () => {
  it("passes a chosen file through the labelled file input", async () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const input = screen.getByLabelText(/Choose a photo/);
    const file = new File(["x"], "a.png", { type: "image/png" });
    await userEvent.upload(input, file);
    expect(onFile).toHaveBeenCalledWith(file);
    expect(screen.getByText(/JPEG, PNG or WebP/)).toBeInTheDocument();
  });
});
