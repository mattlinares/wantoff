import { GenericChannelPage } from "../channel-page";

export default function ItemsPage() {
  return (
    <GenericChannelPage
      itemType="wantoff.items"
      title="Items"
      description="Lend, give away, swap, or sell physical things."
      addLabel="List an item"
    />
  );
}
