import ViewDialog from "./view-dialog";
import SignDialog from "./sign-dialog";
import EditDialog from "./edit-dialog";
import SendDialog from "./send-dialog";
import EmailDialog from "./email-dialog";
import SendMemberDialog from "./send-member-dialog";
import RespondDialog from "./respond-dialog";
import AddendumDialog from "./addendum-dialog";

export default function DocGenDialogs() {
  return (
    <>
      <ViewDialog />
      <SignDialog />
      <EditDialog />
      <SendDialog />
      <EmailDialog />
      <SendMemberDialog />
      <RespondDialog />
      <AddendumDialog />
    </>
  );
}
