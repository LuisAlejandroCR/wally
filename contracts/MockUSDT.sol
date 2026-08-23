// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * Mock USD₮ for the Cerrojo demo, on Ethereum Sepolia.
 *
 * Why this exists: the Sepolia USD₮ in WDK's asset registry cannot be minted by
 * anyone but its owner, so a treasury on this testnet has a balance of zero and
 * no transfer can ever be executed. A lock that has never opened is not a lock
 * anyone should believe in. This token exists so the demo can send exactly one
 * real transaction, on a testnet, with a person's hand on it.
 *
 * Deliberately boring: the ERC-20 surface Cerrojo actually uses, six decimals to
 * match USD₮, and nothing else. No owner, no pause, no upgrade path — there is
 * no privileged account here to lose.
 *
 * `mint` is open on purpose. This is a faucet: anyone reviewing the project can
 * mint themselves a balance and run the payroll against their own address. A
 * token anyone can print is worth nothing, which is the correct value for a
 * token used to demonstrate a refusal.
 */
contract MockUSDT {
    string public constant name = "Cerrojo Mock USDT";
    string public constant symbol = "USDT";
    uint8 public constant decimals = 6;

    /// 1,000,000 USD₮ per call, so a faucet cannot be turned into a stress test.
    uint256 public constant MINT_LIMIT = 1_000_000_000_000;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error AmountExceedsBalance();
    error AmountExceedsAllowance();
    error TransferToZeroAddress();
    error MintOverLimit();

    /// Anyone, any address, up to MINT_LIMIT per call. It is a testnet faucet.
    function mint(address to, uint256 amount) external {
        if (to == address(0)) revert TransferToZeroAddress();
        if (amount > MINT_LIMIT) revert MintOverLimit();

        totalSupply += amount;
        balanceOf[to] += amount;

        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert AmountExceedsAllowance();
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        if (to == address(0)) revert TransferToZeroAddress();
        uint256 balance = balanceOf[from];
        if (balance < amount) revert AmountExceedsBalance();

        unchecked {
            balanceOf[from] = balance - amount;
            balanceOf[to] += amount;
        }

        emit Transfer(from, to, amount);
    }
}
