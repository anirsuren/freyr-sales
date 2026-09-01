"use client";

import type { Customer360Band } from "@/components/customers/Customer360";
import { Modal } from "@/components/ui/Modal";
import type { Opportunity } from "@/lib/opportunitiesShared";
import { DealOverviewEditor } from "./DealOverviewEditor";
import type { DealTeam } from "./DealPeople";

/**
 * THE DEAL'S FIELDS, IN A SHELL THAT IS NOT THE OVERVIEW TAB.
 *
 * Suren, Sep 1: "This overview can be the edit deal, actually, and within the
 * overview, let them edit if you want," and then "When I press Add a Deal,
 * remember all the shit that's there has to be in the overview section
 * underneath in little sections and stuff."
 *
 * So the form is not defined here any more. DealOverviewEditor owns the fields,
 * the sections and the per-field saving, and this file is the shell that puts
 * that same editor on a page of its own or in a dialog. One definition, so
 * whichever door somebody comes through they get the identical form.
 *
 * NO SAVE BUTTON, AND NO CANCEL. Every field commits itself the moment it is
 * changed or left, exactly the way the rest of the app writes a fact. A page
 * that saves per field has nothing for a Save button to do, and a Cancel that
 * cannot un-save anything is a lie.
 *
 * THE SECTIONS OF RECORDS ARE GONE. Same call: "The edit deal has all these
 * things below, right? These things we also don't need, right, because the tabs
 * are already here." Contracts, submissions, presentations, meetings and
 * accruals are each a tab on the deal, carrying their own count and their own
 * add button.
 */
export function EditDealDialog({
  asPage = false,
  deal,
  mayEdit = true,
  why = "",
  customers = [],
  offerings = [],
  people = [],
  meName = "",
  team = null,
  mayChangeTeam = false,
  onClose,
  onSave,
  onSaved,
}: {
  /**
   * RENDER AS A PAGE, NOT A DIALOG.
   *
   * Anir, Sep 1: "the edit deal is actually not supposed to be a pop-up...
   * it should be like the offerings page."
   *
   * The dialog shell below is kept for a caller that wants the same fields on
   * top of where somebody already is. Nothing in the app opens it today: the
   * deal page's Edit control is a Link to /opportunities/{id}/edit, and its
   * `editing` state is never set.
   */
  asPage?: boolean;
  deal: Opportunity;
  /** The same verdict the page's own Edit gate reads. */
  mayEdit?: boolean;
  why?: string;
  customers?: { id: string; name: string }[];
  offerings?: { id: string; name: string; type?: string }[];
  people?: string[];
  meName?: string;
  /** Who is on the deal, and whether this person may change that. The People
   *  section is part of the form, so both doors into it carry them. */
  team?: DealTeam;
  mayChangeTeam?: boolean;
  /**
   * ACCEPTED AND IGNORED, so the call sites that still pass them keep
   * compiling while they are tidied up. The bands used to be rendered here as
   * folds of records with their own add buttons; the deal page's tabs do that
   * job now, and the counts with it.
   */
  bands?: Customer360Band[];
  /** Kept at its real shape rather than loosened to `unknown`, because the
   *  edit page still types its own prop off this one. */
  createOptions?: {
    customers: { id: string; name: string }[];
    opportunities: {
      id: string;
      label: string;
      customer: string;
      customerId: string | null;
    }[];
    members: string[];
    contacts: {
      id: string;
      name: string;
      customerId: string | null;
      title: string;
    }[];
    meName: string;
  } | null;
  onAdd?: (bandKey: string) => void;
  onCreated?: () => void;
  /** Closing the dialog. Unused by the page shell, which has its own back arrow. */
  onClose: () => void;
  /** Returns null on success, or a message to show. */
  onSave?: (patch: Record<string, unknown>) => Promise<string | null>;
  /** Called after a field lands, so the page behind can refresh. */
  onSaved?: () => void;
}) {
  const editor = (
    <DealOverviewEditor
      deal={deal}
      mayEdit={mayEdit}
      why={why}
      customers={customers}
      offerings={offerings}
      people={people}
      meName={meName}
      team={team}
      mayChangeTeam={mayChangeTeam}
      {...(onSave ? { onSave } : {})}
      {...(onSaved ? { onSaved } : {})}
    />
  );

  if (asPage) return <div className="pb-6">{editor}</div>;

  return (
    <Modal
      open
      onClose={onClose}
      /* THE FRAME DOES NOT MOVE (Anir, Aug 31: "stop changing the dimensions
         whenever I click on them. It has to stay the same").
         `tall` plus a fixed height means every state of the form occupies the
         same rectangle and the content scrolls inside it, rather than the box
         resizing and re-centring under the cursor. */
      tall
      dialogClassName="h-[min(820px,calc(100vh-2rem))]"
      title={`Edit ${deal.name}`}
      size="workflow"
    >
      {editor}
    </Modal>
  );
}
