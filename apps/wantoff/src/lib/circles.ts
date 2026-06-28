// Circles SDK helpers: wallet connect, trust-path lookup, in-app CRC payment.
// All SDK imports are dynamic so the packages are never evaluated at module
// load time — prevents auto-triggering window.ethereum in embedded/Playground mode.
import type { Sdk, Avatar } from "@circles-sdk/sdk";
import type { Address } from "@circles-sdk/utils";

export type TrustOverlap = {
  direct: boolean;
  mutualCount: number;
};

const GNOSIS_CHAIN_ID = 100;

export type CirclesConnection = {
  sdk: Sdk;
  avatar: Avatar;
  address: string;
};

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

async function getCirclesSdk() {
  return import("@circles-sdk/sdk");
}

// Signs the backend's wallet login message using an injected browser wallet.
// Used for standalone wallet sign-in (embedded mode gets the sig via miniapp-sdk).
export async function signLoginMessage(message: string): Promise<{ address: string; signature: string }> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No Ethereum wallet found. Install MetaMask or another Circles-compatible wallet.");
  }
  const provider = new (await import("ethers")).BrowserProvider(window.ethereum as any);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const signature = await signer.signMessage(message);
  return { address, signature };
}

// Connects to an injected wallet (e.g. MetaMask) on Gnosis Chain and loads
// the connected address's Circles avatar.
export async function connectCirclesWallet(): Promise<CirclesConnection> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No Ethereum wallet found. Install MetaMask or another Circles-compatible wallet.");
  }
  const { BrowserProviderContractRunner } = await import("@circles-sdk/adapter-ethers");
  const { Sdk, circlesConfig } = await getCirclesSdk();
  const runner = new BrowserProviderContractRunner();
  await runner.init();
  if (!runner.address) {
    throw new Error("Wallet connection failed.");
  }
  const sdk = new Sdk(runner, circlesConfig[GNOSIS_CHAIN_ID]);
  const avatar = await sdk.getAvatar(runner.address);
  return { sdk, avatar, address: runner.address };
}

// Read-only Circles connection using a public JSON-RPC — no MetaMask required.
// Used in embedded mode where window.ethereum is not available.
export async function connectCirclesWalletReadOnly(address: string): Promise<CirclesConnection> {
  const { JsonRpcProvider } = await import("ethers");
  const { Sdk, circlesConfig } = await getCirclesSdk();
  const rpc = process.env.NEXT_PUBLIC_GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com";
  const provider = new JsonRpcProvider(rpc);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runner: any = {
    address: address as Address,
    call: (tx: { to: Address; data: string; value?: bigint }) => provider.call(tx),
    resolveName: (name: string) => provider.resolveName(name),
  };
  const sdk = new Sdk(runner, circlesConfig[GNOSIS_CHAIN_ID]);
  const avatar = await sdk.getAvatar(address as Address);
  return { sdk, avatar, address };
}

// Maximum CRC transferable from `avatar` to `to`. A result of 0 means no
// usable trust path exists yet (per the plan's hard trust-path gate).
export async function getTrustPathAmount(avatar: Avatar, to: string): Promise<number> {
  return avatar.getMaxTransferableAmount(to as Address);
}

// Transfers `amount` CRC (in whole CRC units) from `avatar` to `to`,
// using the Circles trust-graph pathfinder for transitive transfers.
export async function payInCrc(avatar: Avatar, to: string, amount: number) {
  const { parseEther } = await import("ethers");
  return avatar.transfer(to as Address, parseEther(amount.toString()));
}

// Returns how many people the viewer trusts who also trust the host, and
// whether the viewer directly trusts the host.
export async function getTrustOverlap(
  sdk: Sdk,
  viewerAvatar: Avatar,
  hostAddress: string
): Promise<TrustOverlap> {
  const viewerRelations = await viewerAvatar.getTrustRelations();
  const viewerTrusts = new Set(
    viewerRelations
      .filter((r) => r.relation === "trusts" || r.relation === "mutuallyTrusts")
      .map((r) => r.objectAvatar.toLowerCase())
  );

  const direct = viewerTrusts.has(hostAddress.toLowerCase());

  let mutualCount = 0;
  try {
    const hostAvatar = await sdk.getAvatar(hostAddress as Address);
    const hostRelations = await hostAvatar.getTrustRelations();
    const trustedByHost = new Set(
      hostRelations
        .filter((r) => r.relation === "trustedBy" || r.relation === "mutuallyTrusts")
        .map((r) => r.objectAvatar.toLowerCase())
    );
    mutualCount = [...viewerTrusts].filter((a) => trustedByHost.has(a)).length;
  } catch {
    // Host may not have a Circles avatar yet — mutualCount stays 0.
  }

  return { direct, mutualCount };
}
