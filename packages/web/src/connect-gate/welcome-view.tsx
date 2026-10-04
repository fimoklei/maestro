import { useNavigate } from "react-router";
import { Button } from "../ui/button";
import {
  CONNECT_HARNESS,
  WELCOME_BODY,
  WELCOME_TITLE,
} from "./connect-gate-copy";

export function WelcomeView() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="flex max-w-[28rem] flex-col items-center gap-cell">
        <span aria-hidden="true" className="connect-gate-rule" />
        <h1 className="connect-gate-title m-0 font-semibold font-ui text-gray-12 text-title tracking-title">
          {WELCOME_TITLE}
        </h1>
        <p className="connect-gate-body m-0 font-ui text-gray-11 text-prose">
          {WELCOME_BODY}
        </p>
        <Button
          variant="primary"
          className="connect-gate-cta mt-tight"
          onClick={() => navigate("/welcome/connect")}
        >
          {CONNECT_HARNESS}
        </Button>
      </div>
    </div>
  );
}
