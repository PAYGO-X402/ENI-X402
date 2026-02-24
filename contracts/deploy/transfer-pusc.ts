import hre from "hardhat";

const PUSC_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
] as const;

async function main() {
  const [sender] = await hre.ethers.getSigners();

  const puscAddress = process.env.PUSC_ADDRESS;
  const to = process.env.PUSC_TRANSFER_TO;
  const amountRaw = process.env.PUSC_TRANSFER_AMOUNT;

  if (!puscAddress || !hre.ethers.isAddress(puscAddress)) {
    throw new Error("PUSC_ADDRESS is required and must be a valid address.");
  }
  if (!to || !hre.ethers.isAddress(to)) {
    throw new Error("PUSC_TRANSFER_TO is required and must be a valid address.");
  }
  if (!amountRaw) {
    throw new Error("PUSC_TRANSFER_AMOUNT is required, e.g. 12.5");
  }

  const decimalsRaw = process.env.PUSC_DECIMALS || "18";
  const decimals = Number(decimalsRaw);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("PUSC_DECIMALS must be an integer between 0 and 255.");
  }
  const amount = hre.ethers.parseUnits(amountRaw, decimals);

  console.log("Sender:", sender.address);
  console.log("PUSC:", puscAddress);
  console.log("To:", to);
  console.log("Amount:", amountRaw, `(decimals=${decimals})`);

  const pusc = await hre.ethers.getContractAt(PUSC_ABI, puscAddress, sender);

  const fromBefore = await pusc.balanceOf(sender.address);
  const toBefore = await pusc.balanceOf(to);
  console.log("Before -> sender:", hre.ethers.formatUnits(fromBefore, decimals));
  console.log("Before -> to:", hre.ethers.formatUnits(toBefore, decimals));

  const tx = await pusc.transfer(to, amount);
  console.log("Transfer tx:", tx.hash);
  await tx.wait();

  const fromAfter = await pusc.balanceOf(sender.address);
  const toAfter = await pusc.balanceOf(to);
  console.log("After -> sender:", hre.ethers.formatUnits(fromAfter, decimals));
  console.log("After -> to:", hre.ethers.formatUnits(toAfter, decimals));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
