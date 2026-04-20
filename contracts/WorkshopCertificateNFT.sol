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
    uint256 public constant MAX_SUPPLY = 40;
    uint256 private _tokenIdCounter;

    string public constant EVENT_NAME = "MST Blockchain Workshop";
    string public constant EVENT_PLACE = "MIT College of Engineering, Alandi";
    string public constant ISSUING_AUTHORITY = "Masterstroke Academy";

    struct StudentData {
        string studentName;
        string mobileNumber;
        string branch;
        uint256 issuedAt;
    }

    mapping(uint256 => StudentData) public certificateData;
    mapping(address => bool) public hasMinted;

    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        string studentName,
        string mobileNumber,
        string branch,
        string tokenURI
    );

    constructor() ERC721("MIT Alandi Workshop Certificate", "MITWC") {}

    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter;
    }

    function mintWorkshopCertificate(
        string calldata studentName,
        string calldata mobileNumber,
        string calldata branch,
        string calldata tokenURI_
    ) external returns (uint256) {
        address recipient = msg.sender;
        require(bytes(studentName).length > 0, "Student name required");
        require(bytes(mobileNumber).length > 0, "Mobile required");
        require(bytes(branch).length > 0, "Branch required");
        require(bytes(tokenURI_).length > 0, "Token URI required");
        require(_tokenIdCounter < MAX_SUPPLY, "All giveaway NFTs minted");
        require(!hasMinted[recipient], "Already minted");

        uint256 newTokenId = ++_tokenIdCounter;
        _safeMint(recipient, newTokenId);
        hasMinted[recipient] = true;

        certificateData[newTokenId] = StudentData({
            studentName: studentName,
            mobileNumber: mobileNumber,
            branch: branch,
            issuedAt: block.timestamp
        });

        _setTokenURI(newTokenId, tokenURI_);

        emit CertificateMinted(newTokenId, recipient, studentName, mobileNumber, branch, tokenURI_);
        return newTokenId;
    }
}
