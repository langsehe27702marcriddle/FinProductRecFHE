// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract FinancialRecommendationFHE is SepoliaConfig {
    struct EncryptedProfile {
        uint256 profileId;
        euint32 encryptedIncome;      // Encrypted income level
        euint32 encryptedAssets;      // Encrypted asset value
        euint32 encryptedRiskTolerance; // Encrypted risk score
        euint32 encryptedGoals;       // Encrypted financial goals
        uint256 timestamp;
    }

    struct EncryptedRecommendation {
        uint256 recommendationId;
        euint32 encryptedProductId;   // Encrypted recommended product
        euint32 encryptedMatchScore;   // Encrypted suitability score
        uint256 profileId;
        uint256 generatedAt;
    }

    struct DecryptedResult {
        uint32 productId;
        uint32 matchScore;
        bool isRevealed;
    }

    uint256 public profileCount;
    uint256 public recommendationCount;
    mapping(uint256 => EncryptedProfile) public encryptedProfiles;
    mapping(uint256 => EncryptedRecommendation) public encryptedRecommendations;
    mapping(uint256 => DecryptedResult) public decryptedResults;
    
    mapping(uint256 => uint256) private requestToProfileId;
    mapping(uint256 => uint256) private recommendationRequestToId;
    
    event ProfileSubmitted(uint256 indexed profileId, uint256 timestamp);
    event RecommendationRequested(uint256 indexed requestId, uint256 profileId);
    event RecommendationGenerated(uint256 indexed recommendationId);
    event ResultDecrypted(uint256 indexed recommendationId);

    modifier onlyClient(uint256 profileId) {
        // Add proper client authentication in production
        _;
    }

    function submitEncryptedProfile(
        euint32 encryptedIncome,
        euint32 encryptedAssets,
        euint32 encryptedRiskTolerance,
        euint32 encryptedGoals
    ) public {
        profileCount += 1;
        uint256 newProfileId = profileCount;
        
        encryptedProfiles[newProfileId] = EncryptedProfile({
            profileId: newProfileId,
            encryptedIncome: encryptedIncome,
            encryptedAssets: encryptedAssets,
            encryptedRiskTolerance: encryptedRiskTolerance,
            encryptedGoals: encryptedGoals,
            timestamp: block.timestamp
        });
        
        emit ProfileSubmitted(newProfileId, block.timestamp);
    }

    function requestFinancialRecommendation(uint256 profileId) public onlyClient(profileId) {
        EncryptedProfile storage profile = encryptedProfiles[profileId];
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(profile.encryptedIncome);
        ciphertexts[1] = FHE.toBytes32(profile.encryptedAssets);
        ciphertexts[2] = FHE.toBytes32(profile.encryptedRiskTolerance);
        ciphertexts[3] = FHE.toBytes32(profile.encryptedGoals);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.generateRecommendation.selector);
        requestToProfileId[reqId] = profileId;
        
        emit RecommendationRequested(reqId, profileId);
    }

    function generateRecommendation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 profileId = requestToProfileId[requestId];
        require(profileId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32 income, uint32 assets, uint32 riskScore, uint32 goals) = 
            abi.decode(cleartexts, (uint32, uint32, uint32, uint32));
        
        // Simulate FHE recommendation algorithm (in production this would be done off-chain)
        recommendationCount += 1;
        uint256 newRecommendationId = recommendationCount;
        
        // Simplified recommendation logic
        uint32 productId = determineProductId(income, assets, riskScore, goals);
        uint32 matchScore = calculateMatchScore(income, assets, riskScore, goals);
        
        encryptedRecommendations[newRecommendationId] = EncryptedRecommendation({
            recommendationId: newRecommendationId,
            encryptedProductId: FHE.asEuint32(productId),
            encryptedMatchScore: FHE.asEuint32(matchScore),
            profileId: profileId,
            generatedAt: block.timestamp
        });
        
        decryptedResults[newRecommendationId] = DecryptedResult({
            productId: productId,
            matchScore: matchScore,
            isRevealed: false
        });
        
        emit RecommendationGenerated(newRecommendationId);
    }

    function requestRecommendationDecryption(uint256 recommendationId) public onlyClient(recommendationId) {
        EncryptedRecommendation storage rec = encryptedRecommendations[recommendationId];
        require(!decryptedResults[recommendationId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(rec.encryptedProductId);
        ciphertexts[1] = FHE.toBytes32(rec.encryptedMatchScore);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptRecommendation.selector);
        recommendationRequestToId[reqId] = recommendationId;
    }

    function decryptRecommendation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 recommendationId = recommendationRequestToId[requestId];
        require(recommendationId != 0, "Invalid request");
        
        DecryptedResult storage dResult = decryptedResults[recommendationId];
        require(!dResult.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32 productId, uint32 matchScore) = abi.decode(cleartexts, (uint32, uint32));
        
        dResult.productId = productId;
        dResult.matchScore = matchScore;
        dResult.isRevealed = true;
        
        emit ResultDecrypted(recommendationId);
    }

    function getDecryptedResult(uint256 recommendationId) public view returns (
        uint32 productId,
        uint32 matchScore,
        bool isRevealed
    ) {
        DecryptedResult storage r = decryptedResults[recommendationId];
        return (r.productId, r.matchScore, r.isRevealed);
    }

    function getEncryptedProfile(uint256 profileId) public view returns (
        euint32 income,
        euint32 assets,
        euint32 riskTolerance,
        euint32 goals,
        uint256 timestamp
    ) {
        EncryptedProfile storage p = encryptedProfiles[profileId];
        return (p.encryptedIncome, p.encryptedAssets, p.encryptedRiskTolerance, p.encryptedGoals, p.timestamp);
    }

    function getEncryptedRecommendation(uint256 recommendationId) public view returns (
        euint32 productId,
        euint32 matchScore,
        uint256 profileId,
        uint256 generatedAt
    ) {
        EncryptedRecommendation storage r = encryptedRecommendations[recommendationId];
        return (r.encryptedProductId, r.encryptedMatchScore, r.profileId, r.generatedAt);
    }

    // Helper functions for demo purposes
    function determineProductId(uint32 income, uint32 assets, uint32 riskScore, uint32 goals) private pure returns (uint32) {
        // Simplified product matching logic
        if (riskScore > 70 && assets > 500000) {
            return 3; // High-risk investment products
        } else if (income > 100000 && goals == 2) {
            return 2; // Retirement planning products
        } else {
            return 1; // Standard savings products
        }
    }

    function calculateMatchScore(uint32 income, uint32 assets, uint32 riskScore, uint32 goals) private pure returns (uint32) {
        // Simplified scoring algorithm
        uint32 score = (income / 10000) + (assets / 100000) + riskScore + (goals * 10);
        return score > 100 ? 100 : score;
    }
}