# Who can do what in Freyr

Generated from the live privilege table and the code, by
`scripts/qa/buildrolesdoc.mjs`. Regenerate it rather than editing by hand,
or it will drift from the thing it describes.

Last generated: 2026-09-29

## How access is decided

Three questions are asked in order, and a no at any one of them is a no.

1. **The privilege table** (Admin, then Privileges) holds one row per role and
   one column per module. It is the authority. A page with no row in it falls
   back to the older role rules in `lib/moduleAccess.ts`.
2. **The module level** is one of four values:
   `none` (no access), `view` (read only), `edit` (may change existing records), `create` (may add, change and remove).
   Create also carries delete: Suren, Aug 29, "the person who can create only
   can delete. The edit person can only edit, cannot delete."
3. **The record** decides last. A record you neither own, created, nor were
   put on is read only, whatever your module level says. Only the View all
   privilege and the admin role see past that, and only to read.

An admin passes every check. Hiding a button is a courtesy, never the control:
every write route asks these questions again on the server, so a request made
by hand is refused the same way the button would have been.

## The roles

| Role | What it is |
|---|---|
| **Admin** (`admin`) | Runs the workspace. Everything, everywhere. |
| **BD Owner** (`bd_owner`) | Runs a business development group. |
| **BO Owner** (`bo_owner`) | Owns an offering. |
| **View all** (`view_all`) | Can look at records that are not theirs. Read only, never write. |
| **BD Member** (`bd_member`) | Works in a business development group. |
| **BO Member** (`bo_member`) | Works on an offering. |
| **Solutioning Owner** (`sol_owner`) | Runs a solutioning group. |
| **Solutioning Member** (`sol_member`) | Builds what sales asks for. |
| **Delivery Owner** (`delivery_owner`) | Owns what has been sold being delivered. |
| **Delivery Member** (`delivery_member`) | Delivers the work. |

## Every module, every role

Columns are roles, rows are modules. Read a cell as what that role may do on
that page.

| Module | Page | Admin | BD Owner | BO Owner | View all | BD Member | BO Member | Solutioning Owner | Solutioning Member | Delivery Owner | Delivery Member |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Agent | `/agent` | create | create | create | view | edit | edit | create | edit | create | edit |
| Offerings | `/offerings` | create | view | create | view | view | edit | view | view | view | view |
| Digital components | `/components` | create | view | create | view | view | edit | view | view | view | view |
| Opportunities | `/opportunities` | create | create | create | view | edit | edit | view | view | create | edit |
| Customers | `/customers` | create | create | view | view | edit | view | view | view | view | view |
| Contacts | `/contacts` | create | create | view | view | edit | view | view | view | view | view |
| Solutioning requests | `/solutioning` | create | create | create | view | edit | edit | create | edit | create | edit |
| Submissions | `/solutioning?tab=submissions` | create | create | create | view | edit | edit | create | create | create | edit |
| Presentations | `/solutioning?tab=presentations` | create | create | create | view | edit | edit | create | create | create | edit |
| Meetings | `/meetings` | create | create | create | view | edit | edit | create | edit | create | edit |
| Leads | `/leads` | create | create | view | view | edit | view | view | view | view | view |
| Contracts | `/contracts` | create | create | view | view | edit | view | view | view | view | view |
| Revenue accruals | `/revenue-accruals` | create | create | view | view | edit | view | view | view | view | view |
| Team | `/team` | create | view | view | view | view | view | view | view | view | view |
| Goals | `/performance` | create | create | create | view | view | view | create | view | create | view |
| Reports | `/reports` | create | view | view | view | view | view | view | view | view | view |
| Market Intel | `/market-intel` | create | create | view | view | create | view | view | view | view | view |
| Admin | `/admin` | create | none | none | none | none | none | none | none | none | none |

## What each level puts on the page

| Level | Opens the page | Edit controls | New / Add buttons | Delete |
|---|---|---|---|---|
| `none` | no, the URL redirects to Offerings | no | no | no |
| `view` | yes | no | no | no |
| `edit` | yes | yes, on records that are yours | no | no |
| `create` | yes | yes, on records that are yours | yes | yes |

Two modules carry a second gate the table knows nothing about: **Offerings**
and **FDL Components** also ask `canManageOfferings()`, which admits only an
admin or a BD Owner. A role whose row says create there is still refused by
the server if it fails that check, which is why the access badge caps what it
promises on those two pages.

## What the agent may do, per role

The agent proposes an action, the person confirms, and only then does it run.
Every action carries the module it belongs to and whether it needs edit or
create. The gate is asked when the action is proposed, and the route it calls
asks again when it runs.

### Opportunities

| Action | Needs | Admin | BD Owner | BO Owner | View all | BD Member | BO Member | Solutioning Owner | Solutioning Member | Delivery Owner | Delivery Member |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Change a deal | write | yes | yes | yes | no | yes | yes | no | no | yes | yes |
| Open a new deal | create | yes | yes | yes | no | no | no | no | no | yes | no |
| Change who is on a deal or account | write | yes | yes | yes | no | yes | yes | no | no | yes | yes |
| Freeze a month of accruals | create | yes | yes | yes | no | no | no | no | no | yes | no |
| Unfreeze a month of accruals | create | yes | yes | yes | no | no | no | no | no | yes | no |

### Customers

| Action | Needs | Admin | BD Owner | BO Owner | View all | BD Member | BO Member | Solutioning Owner | Solutioning Member | Delivery Owner | Delivery Member |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Set who owns an account | write | yes | yes | no | no | yes | no | no | no | no | no |
| Add a contact at an account | write | yes | yes | no | no | yes | no | no | no | no | no |
| Change a contact's details | write | yes | yes | no | no | yes | no | no | no | no | no |
| Add a customer account | create | yes | yes | no | no | no | no | no | no | no | no |
| Set a follow-up reminder on an account | write | yes | yes | no | no | yes | no | no | no | no | no |
| Log a call, email or meeting you already had | write | yes | yes | no | no | yes | no | no | no | no | no |
| Save an outreach draft | write | yes | yes | no | no | yes | no | no | no | no | no |
| Create a customer group | create | yes | yes | no | no | no | no | no | no | no | no |
| Rename a customer group | write | yes | yes | no | no | yes | no | no | no | no | no |
| Put an account in a customer group | write | yes | yes | no | no | yes | no | no | no | no | no |
| Take an account out of a customer group | write | yes | yes | no | no | yes | no | no | no | no | no |
| Change an account's details | write | yes | yes | no | no | yes | no | no | no | no | no |
| Add a note to an account | write | yes | yes | no | no | yes | no | no | no | no | no |

### Presentations

| Action | Needs | Admin | BD Owner | BO Owner | View all | BD Member | BO Member | Solutioning Owner | Solutioning Member | Delivery Owner | Delivery Member |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Raise a solutioning request | write | yes | yes | yes | no | yes | yes | yes | yes | yes | yes |
| Change a solutioning request | write | yes | yes | yes | no | yes | yes | yes | yes | yes | yes |
| Assign a solutioning request to someone | write | yes | yes | yes | no | yes | yes | yes | yes | yes | yes |
| Pick up a solutioning request | write | yes | yes | yes | no | yes | yes | yes | yes | yes | yes |
| Mark a solutioning request complete | write | yes | yes | yes | no | yes | yes | yes | yes | yes | yes |
| Cancel a solutioning request | write | yes | yes | yes | no | yes | yes | yes | yes | yes | yes |
| Reopen a solutioning request | write | yes | yes | yes | no | yes | yes | yes | yes | yes | yes |
| Comment on a solutioning request | write | yes | yes | yes | no | yes | yes | yes | yes | yes | yes |
| Set a request's priority | write | yes | yes | yes | no | yes | yes | yes | yes | yes | yes |

### Meetings

| Action | Needs | Admin | BD Owner | BO Owner | View all | BD Member | BO Member | Solutioning Owner | Solutioning Member | Delivery Owner | Delivery Member |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Log or plan a meeting | create | yes | yes | yes | no | no | no | yes | no | yes | no |
| Change a meeting | write | yes | yes | yes | no | yes | yes | yes | yes | yes | yes |
| Mark a meeting held or cancelled | write | yes | yes | yes | no | yes | yes | yes | yes | yes | yes |
| Add a note to a meeting | write | yes | yes | yes | no | yes | yes | yes | yes | yes | yes |

### Leads

| Action | Needs | Admin | BD Owner | BO Owner | View all | BD Member | BO Member | Solutioning Owner | Solutioning Member | Delivery Owner | Delivery Member |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Add a lead | create | yes | yes | no | no | no | no | no | no | no | no |
| Change a lead | write | yes | yes | no | no | yes | no | no | no | no | no |
| Mark a lead as converted | write | yes | yes | no | no | yes | no | no | no | no | no |
| Re-read a lead's LinkedIn profile | write | yes | yes | no | no | yes | no | no | no | no | no |

### Contracts

| Action | Needs | Admin | BD Owner | BO Owner | View all | BD Member | BO Member | Solutioning Owner | Solutioning Member | Delivery Owner | Delivery Member |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Record a contract | create | yes | yes | no | no | no | no | no | no | no | no |
| Change a contract | write | yes | yes | no | no | yes | no | no | no | no | no |

### Revenue accruals

| Action | Needs | Admin | BD Owner | BO Owner | View all | BD Member | BO Member | Solutioning Owner | Solutioning Member | Delivery Owner | Delivery Member |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Plan the months a deal's revenue lands in | write | yes | yes | no | no | yes | no | no | no | no | no |

### Goals

| Action | Needs | Admin | BD Owner | BO Owner | View all | BD Member | BO Member | Solutioning Owner | Solutioning Member | Delivery Owner | Delivery Member |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Put a person on a goal | write | yes | yes | yes | no | no | no | yes | no | yes | no |
| Take a person off a goal | write | yes | yes | yes | no | no | no | yes | no | yes | no |
| Put a whole group on a goal | write | yes | yes | yes | no | no | no | yes | no | yes | no |
| Take a whole group off a goal | write | yes | yes | yes | no | no | no | yes | no | yes | no |
| Log a result against a goal | write | yes | yes | yes | no | no | no | yes | no | yes | no |
| Move a person into or out of a group | write | yes | yes | yes | no | no | no | yes | no | yes | no |
| Verify a logged goal result | write | yes | yes | yes | no | no | no | yes | no | yes | no |
| Send a logged goal result back | write | yes | yes | yes | no | no | no | yes | no | yes | no |
| Create a goal | create | yes | yes | yes | no | no | no | yes | no | yes | no |
| Change a goal | write | yes | yes | yes | no | no | no | yes | no | yes | no |
| Add a subgoal under a goal | write | yes | yes | yes | no | no | no | yes | no | yes | no |
| Correct a logged result | write | yes | yes | yes | no | no | no | yes | no | yes | no |
| Create a group | create | yes | yes | yes | no | no | no | yes | no | yes | no |
| Rename a group or change its head | write | yes | yes | yes | no | no | no | yes | no | yes | no |

### Market Intel

| Action | Needs | Admin | BD Owner | BO Owner | View all | BD Member | BO Member | Solutioning Owner | Solutioning Member | Delivery Owner | Delivery Member |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Star or unstar a company in Market Intel | write | yes | yes | no | no | yes | no | no | no | no | no |
| Track a new company in Market Intel | write | yes | yes | no | no | yes | no | no | no | no | no |
| Take a company off your Market Intel list | write | yes | yes | no | no | yes | no | no | no | no | no |

## Things worth knowing

- **Solutioning requests, Submissions and Presentations are three separate
  privileges sharing one route.** They are told apart by `?tab=`, so a role
  can be given one and refused another.
- **The nav is not a permission.** The sidebar hides what you may not open,
  but the Solutioning sub-items (Solutioning requests, Submissions,
  Presentations, Meetings) are drawn without asking, unlike the Opportunities
  sub-items which do ask. No role in the table currently hits that gap.
- **Three agent actions run without a route**: Set a follow-up, Log a touch and
  Save a draft. They are checked when proposed, and unlike every other action
  there is no second check when they run.
- **Creating is decided by whether the save will create**, not by whether an id
  was supplied. Leads and Contracts both used to ask the weaker question, so a
  junk id let an edit-only role start new records; fixed Sep 29.
