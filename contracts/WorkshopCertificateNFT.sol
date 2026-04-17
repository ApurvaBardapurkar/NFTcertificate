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
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.6/contracts/utils/Strings.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.6/contracts/utils/Base64.sol";

contract WorkshopCertificateNFT is ERC721URIStorage {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 50;
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
        string branch
    );

    constructor() ERC721("MIT Alandi Workshop Certificate", "MITWC") {}

    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter;
    }

    function mintWorkshopCertificate(
        string calldata studentName,
        string calldata mobileNumber,
        string calldata branch
    ) external returns (uint256) {
        address recipient = msg.sender;
        require(bytes(studentName).length > 0, "Student name required");
        require(bytes(mobileNumber).length > 0, "Mobile required");
        require(bytes(branch).length > 0, "Branch required");
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

        _setTokenURI(newTokenId, _buildMetadata(newTokenId));

        emit CertificateMinted(newTokenId, recipient, studentName, mobileNumber, branch);
        return newTokenId;
    }

    function _buildMetadata(uint256 tokenId) private view returns (string memory) {
        StudentData memory data = certificateData[tokenId];
        string memory image = _buildSvgImage(data);

        string memory issuedAtString = data.issuedAt.toString();
        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name":"MIT Workshop Certificate #',
                        tokenId.toString(),
                        '","description":"Official on-chain participation certificate issued by Masterstroke Academy for the MST Blockchain Workshop.",',
                        '"image":"data:image/svg+xml;base64,',
                        Base64.encode(bytes(image)),
                        '","attributes":[',
                        '{"trait_type":"Event Name","value":"',
                        EVENT_NAME,
                        '"},',
                        '{"trait_type":"Event Place","value":"',
                        EVENT_PLACE,
                        '"},',
                        '{"trait_type":"Student Name","value":"',
                        data.studentName,
                        '"},',
                        '{"trait_type":"Mobile Number","value":"',
                        data.mobileNumber,
                        '"},',
                        '{"trait_type":"Branch","value":"',
                        data.branch,
                        '"},',
                        '{"trait_type":"Issuing Authority","value":"',
                        ISSUING_AUTHORITY,
                        '"},',
                        '{"trait_type":"Issued At (Unix)","value":"',
                        issuedAtString,
                        '"}',
                        "]}"
                    )
                )
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    function _buildSvgImage(StudentData memory data) private pure returns (string memory) {
        return string(
            abi.encodePacked(
                "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'>",
                "<rect width='100%' height='100%' fill='#0f172a'/>",
                "<rect x='40' y='40' width='1120' height='550' rx='20' fill='#1e293b' stroke='#6366f1' stroke-width='4'/>",
                "<text x='80' y='120' fill='white' font-size='44' font-family='Arial'>Certificate of Participation</text>",
                "<text x='80' y='180' fill='#cbd5e1' font-size='26' font-family='Arial'>MST Blockchain Workshop</text>",
                "<text x='80' y='220' fill='#cbd5e1' font-size='24' font-family='Arial'>MIT College of Engineering, Alandi</text>",
                "<text x='80' y='260' fill='#cbd5e1' font-size='22' font-family='Arial'>Issued by Masterstroke Academy</text>",
                "<text x='80' y='280' fill='white' font-size='36' font-family='Arial'>Student: ",
                data.studentName,
                "</text>",
                "<text x='80' y='340' fill='white' font-size='30' font-family='Arial'>Mobile: ",
                data.mobileNumber,
                "</text>",
                "<text x='80' y='400' fill='white' font-size='30' font-family='Arial'>Branch: ",
                data.branch,
                "</text>",
                "<text x='80' y='500' fill='#a5b4fc' font-size='24' font-family='Arial'>On-chain certificate NFT (MST Testnet)</text>",
                "</svg>"
            )
        );
    }
}

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
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.6/contracts/utils/Strings.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.6/contracts/utils/Base64.sol";

contract WorkshopCertificateNFT is ERC721URIStorage {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 50;
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
        string branch
    );

    constructor() ERC721("MIT Alandi Workshop Certificate", "MITWC") {}

    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter;
    }

    function mintWorkshopCertificate(
        string calldata studentName,
        string calldata mobileNumber,
        string calldata branch
    ) external returns (uint256) {
        address recipient = msg.sender;
        require(bytes(studentName).length > 0, "Student name required");
        require(bytes(mobileNumber).length > 0, "Mobile required");
        require(bytes(branch).length > 0, "Branch required");
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

        _setTokenURI(newTokenId, _buildMetadata(newTokenId));

        emit CertificateMinted(newTokenId, recipient, studentName, mobileNumber, branch);
        return newTokenId;
    }

    function _buildMetadata(uint256 tokenId) private view returns (string memory) {
        StudentData memory data = certificateData[tokenId];
        string memory image = _buildSvgImage(data);

        string memory issuedAtString = data.issuedAt.toString();
        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name":"MIT Workshop Certificate #',
                        tokenId.toString(),
                        '","description":"Official on-chain participation certificate issued by Masterstroke Academy for the MST Blockchain Workshop.",',
                        '"image":"data:image/svg+xml;base64,',
                        Base64.encode(bytes(image)),
                        '","attributes":[',
                        '{"trait_type":"Event Name","value":"',
                        EVENT_NAME,
                        '"},',
                        '{"trait_type":"Event Place","value":"',
                        EVENT_PLACE,
                        '"},',
                        '{"trait_type":"Student Name","value":"',
                        data.studentName,
                        '"},',
                        '{"trait_type":"Mobile Number","value":"',
                        data.mobileNumber,
                        '"},',
                        '{"trait_type":"Branch","value":"',
                        data.branch,
                        '"},',
                        '{"trait_type":"Issuing Authority","value":"',
                        ISSUING_AUTHORITY,
                        '"},',
                        '{"trait_type":"Issued At (Unix)","value":"',
                        issuedAtString,
                        '"}',
                        "]}"
                    )
                )
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    function _buildSvgImage(StudentData memory data) private pure returns (string memory) {
        return string(
            abi.encodePacked(
                "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'>",
                "<rect width='100%' height='100%' fill='#0f172a'/>",
                "<rect x='40' y='40' width='1120' height='550' rx='20' fill='#1e293b' stroke='#6366f1' stroke-width='4'/>",
                "<text x='80' y='120' fill='white' font-size='44' font-family='Arial'>Certificate of Participation</text>",
                "<text x='80' y='180' fill='#cbd5e1' font-size='26' font-family='Arial'>MST Blockchain Workshop</text>",
                "<text x='80' y='220' fill='#cbd5e1' font-size='24' font-family='Arial'>MIT College of Engineering, Alandi</text>",
                "<text x='80' y='260' fill='#cbd5e1' font-size='22' font-family='Arial'>Issued by Masterstroke Academy</text>",
                "<text x='80' y='280' fill='white' font-size='36' font-family='Arial'>Student: ",
                data.studentName,
                "</text>",
                "<text x='80' y='340' fill='white' font-size='30' font-family='Arial'>Mobile: ",
                data.mobileNumber,
                "</text>",
                "<text x='80' y='400' fill='white' font-size='30' font-family='Arial'>Branch: ",
                data.branch,
                "</text>",
                "<text x='80' y='500' fill='#a5b4fc' font-size='24' font-family='Arial'>On-chain certificate NFT (MST Testnet)</text>",
                "</svg>"
            )
        );
    }
}
