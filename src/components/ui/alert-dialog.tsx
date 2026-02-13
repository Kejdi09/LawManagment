import type { HTMLAttributes } from "react";
import { classNames } from "../../lib/utils";

type Props = HTMLAttributes<HTMLDivElement>;

export default function AlertDialog({ className = "", ...props }: Props) {
  return <div className={classNames("ui-alert-dialog", className)} role="alertdialog" {...props} />;
}
