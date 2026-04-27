// SPDX-License-Identifier: MIT
// IMPORTANT (MST Testnet compatibility):
// - MST testnet RPC currently fails on the Cancun opcode `MCOPY`
// - OpenZeppelin v5 uses `mcopy` (requires Cancun) and will not compile for EVM "paris"
// Use:
// - Solidity 0.8.20
// - EVM Version = Paris
// - OpenZeppelin v4.9.6 imports (no `mcopy`)
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.6/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract WorkshopCertificateNFT is ERC721URIStorage {
    uint256 public constant MAX_SUPPLY_PER_EVENT = 1000000;
    uint256 private _tokenIdCounter;

    struct StudentData {
        uint256 eventId;
        string studentName;
        string branch;
        uint256 issuedAt;
    }

    mapping(uint256 => StudentData) public certificateData;
    mapping(uint256 => uint256) public mintedForEvent; // eventId => minted count
    mapping(uint256 => mapping(address => bool)) public hasMinted; // eventId => address => minted?

    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        uint256 indexed eventId,
        string studentName,
        string branch,
        string tokenURI
    );

    constructor() ERC721("Workshop Certificate", "WCCERT") {}

    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter;
    }

    function totalSupplyForEvent(uint256 eventId) public view returns (uint256) {
        return mintedForEvent[eventId];
    }

    function mintWorkshopCertificate(
        uint256 eventId,
        string calldata studentName,
        string calldata branch,
        string calldata tokenURI_
    ) external returns (uint256) {
        address recipient = msg.sender;
        require(eventId > 0, "Event required");
        require(bytes(studentName).length > 0, "Student name required");
        require(bytes(branch).length > 0, "Branch required");
        require(bytes(tokenURI_).length > 0, "Token URI required");
        require(mintedForEvent[eventId] < MAX_SUPPLY_PER_EVENT, "All event NFTs minted");
        require(!hasMinted[eventId][recipient], "Already minted for event");

        uint256 newTokenId = ++_tokenIdCounter;
        _safeMint(recipient, newTokenId);
        hasMinted[eventId][recipient] = true;
        mintedForEvent[eventId] = mintedForEvent[eventId] + 1;

        certificateData[newTokenId] = StudentData({
            eventId: eventId,
            studentName: studentName,
            branch: branch,
            issuedAt: block.timestamp
        });

        _setTokenURI(newTokenId, tokenURI_);

        emit CertificateMinted(newTokenId, recipient, eventId, studentName, branch, tokenURI_);
        return newTokenId;
    }
}
