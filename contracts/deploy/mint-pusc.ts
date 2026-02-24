import hre from "hardhat";

const PUSC_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address account) external view returns (uint256)",
] as const;

async function main() {
  const [owner] = await hre.ethers.getSigners();

  const puscAddress = process.env.PUSC_ADDRESS;
  if (!puscAddress || !hre.ethers.isAddress(puscAddress)) {
    throw new Error("PUSC_ADDRESS is required and must be a valid address.");
  }

  const mintTo = process.env.PUSC_MINT_TO && process.env.PUSC_MINT_TO.trim().length > 0
    ? process.env.PUSC_MINT_TO.trim()
    : owner.address;
  if (!hre.ethers.isAddress(mintTo)) {
    throw new Error("PUSC_MINT_TO must be a valid address when provided.");
  }

  const mintAmountRaw = process.env.PUSC_MINT_AMOUNT || "1000";
  const decimalsRaw = process.env.PUSC_DECIMALS || "18";
  const decimals = Number(decimalsRaw);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("PUSC_DECIMALS must be an integer between 0 and 255.");
  }
  const mintAmount = hre.ethers.parseUnits(mintAmountRaw, decimals);

  console.log("Owner:", owner.address);
  console.log("PUSC:", puscAddress);
  console.log("Mint to:", mintTo);
  console.log("Mint amount:", mintAmountRaw, `(decimals=${decimals})`);

  const pusc = await hre.ethers.getContractAt(PUSC_ABI, puscAddress, owner);
  const tx = await pusc.mint(mintTo, mintAmount);
  console.log("Mint tx:", tx.hash);
  await tx.wait();

  const balance = await pusc.balanceOf(mintTo);
  console.log("New balance:", hre.ethers.formatUnits(balance, decimals));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
