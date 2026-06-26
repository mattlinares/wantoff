# Mealmate, and the bigger idea behind it

## What is Mealmate?

Mealmate is a simple way for people to share home-cooked food with their
neighbours.

If you're cooking and have spare portions, you can post a meal — what it is,
when it's ready, how many spots are free, and any dietary info. People nearby
can browse what's on offer and join one for a small number of "meal
credits" (everyone starts with a few, and hosting earns more).

A few things keep it fair and friendly:

- **Reputation**: after a meal, host and guest can rate each other. Turning
  up (or giving notice if you can't) keeps your score healthy. Some meals
  require a minimum reputation to join.
- **Location**: meals near you are shown first.
- **Notifications**: hosts are told when someone joins, everyone's notified
  about new messages and reviews.
- **Tips**: if a host has a Circles (CRC) wallet, guests can send an
  optional tip after the meal — never required.
- **Fair use**: if you join a lot of meals very frequently, a small platform
  fee may apply, to keep things sustainable for hosts.

It's deliberately low-friction: no payment processing for the meal itself,
just a lightweight credit system so things stay roughly balanced.

## The bigger idea: an open network of "offers" and "wants"

Mealmate is one example of something more general: a shared, open way for
people to publish what they **have to give** and what they **want**, so
that other people (or apps) can act on it directly.

Underneath Mealmate is a small, app-agnostic format for describing:

- an **offer** ("I have a spare meal / spare hour / spare tool")
- a **want** ("I'm looking for a lift / a hand / a hot meal")
- the **terms** — any cost, credit, or suggested donation attached
- who's involved, their reputation, and how to get in touch
- what happened afterwards — reviews and feedback

Mealmate fills this in with "home-cooked meals", but the same shape could
describe lift-shares, tool libraries, skill-swaps, surplus food from shops,
or community volunteering — anything where one person's spare capacity is
another person's want, published openly enough that someone (a person or an
app) can simply act on it.

The goal is that this stays a *protocol*, not a platform — a common
language for "openly published, actionable wants and desires" that more
than one app or community can build on, with each app (like Mealmate) free
to add its own rules, UI, and community norms on top.

For the technical version of this, see `docs/exchange-protocol.md`.
