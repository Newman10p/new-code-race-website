import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import App from "../App";

async function openWorkspace() {
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByRole("heading", { name: /pair programmer/i })).toBeTruthy();
  return user;
}

describe("CODE RACE AI workspace", () => {
  test("renders the welcome workspace with prompt cards and no route errors", async () => {
    await openWorkspace();
    expect(screen.getByText("Suggested prompts")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Debug My Code/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /AI model: CODE RACE Auto/ })).toBeTruthy();
    expect(screen.getByLabelText("Message CODE RACE AI")).toBeTruthy();
    expect(screen.getByText(/Demo mode — replies are local samples/i)).toBeTruthy();
  });

  test("sends a suggested prompt and streams a clearly labelled demonstration answer", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: /Debug My Code/ }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: /pair programmer/i })).toBeNull());
    expect(await screen.findByText(/Demo sample/)).toBeTruthy();
    expect(await screen.findByText("Error analysis", {}, { timeout: 12000 })).toBeTruthy();
    expect(await screen.findByText(/Demonstration only/i, {}, { timeout: 12000 })).toBeTruthy();
  });

  test("creates a conversation from the composer and supports tool + language selection", async () => {
    const user = await openWorkspace();
    const input = screen.getByLabelText("Message CODE RACE AI");
    await user.type(input, "Explain promises in JavaScript");
    await user.keyboard("{Enter}");

    expect((await screen.findAllByText("Explain promises in JavaScript")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "AI model: CODE RACE Auto" })).toBeTruthy();

    // Tool selector menu.
    await user.click(screen.getByRole("button", { name: "Auto" }));
    expect(await screen.findByText("Assistant mode")).toBeTruthy();
    await user.click(screen.getByRole("menuitemradio", { name: /Debug/ }));

    // Language selector menu.
    await user.click(screen.getByRole("button", { name: /Python/ }));
    expect(await screen.findByText("Language")).toBeTruthy();
    await user.click(screen.getByRole("menuitemradio", { name: /JavaScript/ }));
  });

  test("renames and deletes a conversation with confirmation", async () => {
    const user = await openWorkspace();
    await user.type(screen.getByLabelText("Message CODE RACE AI"), "Teach me recursion");
    await user.keyboard("{Enter}");
    await screen.findAllByText("Teach me recursion");
    // Rename after the demonstration reply settles so the click does not race
    // the streamed updates that keep re-rendering the sidebar.
    await waitFor(() => expect(screen.queryByLabelText("Stop generating")).toBeNull(), { timeout: 15000 });

    await user.click(screen.getAllByLabelText(/^Rename /)[0]);
    const titleInput = screen.getByLabelText("Conversation title");
    await user.clear(titleInput);
    await user.type(titleInput, "Recursion lesson{Enter}");
    expect((await screen.findAllByText("Recursion lesson")).length).toBeGreaterThan(0);

    await user.click(screen.getAllByLabelText(/^Delete /)[0]);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Delete conversation/ }));
    expect(await screen.findByText(/Conversation deleted/)).toBeTruthy();
  });

  test("opens the context panel and help dialog", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: /Open context panel|Close context panel/ }));
    expect((await screen.findAllByText("Current context")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Help & documentation/ }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Keyboard shortcuts")).toBeTruthy();
  });

  test("opens AI preferences and rejects an invalid backend URL", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "AI preferences" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    const input = screen.getByLabelText("Backend base URL") as HTMLInputElement;
    expect(input.value).toBe("");

    await user.type(input, "not-a-url");
    expect(await screen.findByText(/Enter a URL starting with http/i)).toBeTruthy();
    const save = screen.getByRole("button", { name: /Save & test/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });
});

