import { render, screen } from "@testing-library/react";
import { Card } from "./card";

describe("Card", () => {
  it("renders its children", () => {
    render(<Card>body content</Card>);
    expect(screen.getByText("body content")).toBeInTheDocument();
  });

  it("renders a header with the title and status slot when a title is given", () => {
    render(
      <Card title="Claude Code" status={<span>● in sync</span>}>
        rows
      </Card>,
    );
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("● in sync")).toBeInTheDocument();
  });

  it("omits the header and its status slot when no title is given", () => {
    render(<Card status={<span>● in sync</span>}>rows</Card>);
    expect(screen.queryByText("● in sync")).not.toBeInTheDocument();
  });

  it("shows the kind label alongside the title", () => {
    render(
      <Card title="~/dev/acme-web" kind="local">
        rows
      </Card>,
    );
    expect(screen.getByText("local")).toBeInTheDocument();
  });
});
