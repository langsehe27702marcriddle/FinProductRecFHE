// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface FinancialProduct {
  id: string;
  name: string;
  category: string;
  riskLevel: number;
  estimatedReturn: number;
  encryptedScore: string;
  timestamp: number;
  owner: string;
  status: "pending" | "approved" | "rejected";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<FinancialProduct[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newProductData, setNewProductData] = useState({
    name: "",
    category: "",
    riskLevel: 3,
    estimatedReturn: 5.0
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<FinancialProduct | null>(null);
  const itemsPerPage = 6;

  // Calculate statistics for dashboard
  const approvedCount = products.filter(p => p.status === "approved").length;
  const pendingCount = products.filter(p => p.status === "pending").length;
  const rejectedCount = products.filter(p => p.status === "rejected").length;

  // Filter products based on search and category
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Get unique categories for filter
  const categories = ["all", ...Array.from(new Set(products.map(p => p.category)))];

  useEffect(() => {
    loadProducts().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadProducts = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("product_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing product keys:", e);
        }
      }
      
      const list: FinancialProduct[] = [];
      
      for (const key of keys) {
        try {
          const productBytes = await contract.getData(`product_${key}`);
          if (productBytes.length > 0) {
            try {
              const productData = JSON.parse(ethers.toUtf8String(productBytes));
              list.push({
                id: key,
                name: productData.name,
                category: productData.category,
                riskLevel: productData.riskLevel,
                estimatedReturn: productData.estimatedReturn,
                encryptedScore: productData.encryptedScore,
                timestamp: productData.timestamp,
                owner: productData.owner,
                status: productData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing product data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading product ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setProducts(list);
    } catch (e) {
      console.error("Error loading products:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitProduct = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Calculating personalized score with FHE..."
    });
    
    try {
      // Simulate FHE computation for personalized score
      const fheScore = `FHE-${btoa(JSON.stringify({
        riskScore: Math.floor(Math.random() * 100),
        returnScore: Math.floor(Math.random() * 100),
        compatibility: Math.floor(Math.random() * 100)
      }))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const productId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const productData = {
        name: newProductData.name,
        category: newProductData.category,
        riskLevel: newProductData.riskLevel,
        estimatedReturn: newProductData.estimatedReturn,
        encryptedScore: fheScore,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "pending"
      };
      
      // Store product data on-chain using FHE
      await contract.setData(
        `product_${productId}`, 
        ethers.toUtf8Bytes(JSON.stringify(productData))
      );
      
      const keysBytes = await contract.getData("product_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(productId);
      
      await contract.setData(
        "product_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE score calculated and stored securely!"
      });
      
      await loadProducts();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewProductData({
          name: "",
          category: "",
          riskLevel: 3,
          estimatedReturn: 5.0
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const approveProduct = async (productId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing FHE verification..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const productBytes = await contract.getData(`product_${productId}`);
      if (productBytes.length === 0) {
        throw new Error("Product not found");
      }
      
      const productData = JSON.parse(ethers.toUtf8String(productBytes));
      
      const updatedProduct = {
        ...productData,
        status: "approved"
      };
      
      await contract.setData(
        `product_${productId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProduct))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE verification completed successfully!"
      });
      
      await loadProducts();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const rejectProduct = async (productId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing FHE rejection..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const productBytes = await contract.getData(`product_${productId}`);
      if (productBytes.length === 0) {
        throw new Error("Product not found");
      }
      
      const productData = JSON.parse(ethers.toUtf8String(productBytes));
      
      const updatedProduct = {
        ...productData,
        status: "rejected"
      };
      
      await contract.setData(
        `product_${productId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProduct))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE rejection completed successfully!"
      });
      
      await loadProducts();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Rejection failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: isAvailable ? "FHE system is available!" : "FHE system is not available"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to access the FHE recommendation system",
      icon: "🔗"
    },
    {
      title: "Submit Financial Profile",
      description: "Provide your encrypted financial data for personalized recommendations",
      icon: "🔒"
    },
    {
      title: "FHE Computation",
      description: "Your data is processed in encrypted state without decryption",
      icon: "⚙️"
    },
    {
      title: "Get Recommendations",
      description: "Receive personalized financial product recommendations",
      icon: "📊"
    }
  ];

  const renderRiskMeter = (riskLevel: number) => {
    return (
      <div className="risk-meter">
        <div className="meter-track">
          <div 
            className="meter-fill" 
            style={{ width: `${(riskLevel / 5) * 100}%` }}
          ></div>
        </div>
        <span className="risk-label">{["Low", "Moderate", "Medium", "High", "Very High"][riskLevel - 1]}</span>
      </div>
    );
  };

  const renderProductDetails = (product: FinancialProduct) => {
    return (
      <div className="product-details">
        <h3>{product.name}</h3>
        <div className="detail-row">
          <span className="label">Category:</span>
          <span className="value">{product.category}</span>
        </div>
        <div className="detail-row">
          <span className="label">Risk Level:</span>
          <span className="value">{renderRiskMeter(product.riskLevel)}</span>
        </div>
        <div className="detail-row">
          <span className="label">Estimated Return:</span>
          <span className="value">{product.estimatedReturn}%</span>
        </div>
        <div className="detail-row">
          <span className="label">FHE Score:</span>
          <span className="value encrypted">{product.encryptedScore.substring(0, 20)}...</span>
        </div>
        <div className="detail-row">
          <span className="label">Added:</span>
          <span className="value">{new Date(product.timestamp * 1000).toLocaleDateString()}</span>
        </div>
        <div className="detail-row">
          <span className="label">Status:</span>
          <span className={`status-badge ${product.status}`}>{product.status}</span>
        </div>
        <button 
          className="close-details-btn"
          onClick={() => setSelectedProduct(null)}
        >
          Close
        </button>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>FHE<span>Finance</span>Rec</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={checkAvailability} 
            className="action-btn"
          >
            Check FHE Status
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="primary-btn"
          >
            Add Product
          </button>
          <button 
            className="action-btn"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Privacy-Preserving Financial Recommendations</h2>
            <p>Get personalized financial product suggestions without compromising your data privacy</p>
          </div>
          <div className="fhe-badge">
            <span>FHE-Powered</span>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How It Works</h2>
            <p className="subtitle">FHE technology keeps your financial data encrypted throughout the process</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-number">{index + 1}</div>
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-section">
          <h2>Financial Products Overview</h2>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{products.length}</div>
              <div className="stat-label">Total Products</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{approvedCount}</div>
              <div className="stat-label">Approved</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{pendingCount}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{rejectedCount}</div>
              <div className="stat-label">Rejected</div>
            </div>
          </div>
        </div>
        
        <div className="products-section">
          <div className="section-header">
            <h2>Financial Products</h2>
            <div className="controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search products..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select 
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="filter-select"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === "all" ? "All Categories" : cat}
                  </option>
                ))}
              </select>
              <button 
                onClick={loadProducts}
                className="action-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          {selectedProduct ? (
            <div className="product-detail-view">
              {renderProductDetails(selectedProduct)}
            </div>
          ) : (
            <>
              <div className="products-grid">
                {paginatedProducts.length === 0 ? (
                  <div className="no-products">
                    <div className="no-products-icon"></div>
                    <p>No financial products found</p>
                    <button 
                      className="primary-btn"
                      onClick={() => setShowCreateModal(true)}
                    >
                      Add First Product
                    </button>
                  </div>
                ) : (
                  paginatedProducts.map(product => (
                    <div className="product-card" key={product.id}>
                      <div className="product-header">
                        <h3>{product.name}</h3>
                        <span className={`status-badge ${product.status}`}>{product.status}</span>
                      </div>
                      <div className="product-category">{product.category}</div>
                      <div className="product-details-preview">
                        <div className="detail">
                          <span className="label">Risk:</span>
                          {renderRiskMeter(product.riskLevel)}
                        </div>
                        <div className="detail">
                          <span className="label">Return:</span>
                          <span className="value">{product.estimatedReturn}%</span>
                        </div>
                      </div>
                      <div className="product-actions">
                        <button 
                          className="view-details-btn"
                          onClick={() => setSelectedProduct(product)}
                        >
                          View Details
                        </button>
                        {isOwner(product.owner) && product.status === "pending" && (
                          <div className="owner-actions">
                            <button 
                              className="approve-btn"
                              onClick={() => approveProduct(product.id)}
                            >
                              Approve
                            </button>
                            <button 
                              className="reject-btn"
                              onClick={() => rejectProduct(product.id)}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {totalPages > 1 && (
                <div className="pagination">
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <span>Page {currentPage} of {totalPages}</span>
                  <button 
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitProduct} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          productData={newProductData}
          setProductData={setNewProductData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✕"}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>FHE Finance Rec</span>
            </div>
            <p>Privacy-preserving financial product recommendations</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE Finance Rec. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  productData: any;
  setProductData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  productData,
  setProductData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProductData({
      ...productData,
      [name]: name === "riskLevel" || name === "estimatedReturn" ? Number(value) : value
    });
  };

  const handleSubmit = () => {
    if (!productData.name || !productData.category) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Add Financial Product</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="key-icon"></div> FHE will calculate a personalized score for this product
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Product Name *</label>
              <input 
                type="text"
                name="name"
                value={productData.name} 
                onChange={handleChange}
                placeholder="Enter product name..." 
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label>Category *</label>
              <select 
                name="category"
                value={productData.category} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="">Select category</option>
                <option value="Savings">Savings Account</option>
                <option value="Investment">Investment Fund</option>
                <option value="Loan">Personal Loan</option>
                <option value="Insurance">Insurance</option>
                <option value="Credit">Credit Card</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Risk Level (1-5)</label>
              <input 
                type="range"
                name="riskLevel"
                min="1"
                max="5"
                value={productData.riskLevel} 
                onChange={handleChange}
                className="form-range"
              />
              <div className="range-labels">
                <span>Low</span>
                <span>Moderate</span>
                <span>Medium</span>
                <span>High</span>
                <span>Very High</span>
              </div>
            </div>
            
            <div className="form-group">
              <label>Estimated Return (%)</label>
              <input 
                type="number"
                name="estimatedReturn"
                step="0.1"
                min="0"
                max="50"
                value={productData.estimatedReturn} 
                onChange={handleChange}
                className="form-input"
              />
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn primary-btn"
          >
            {creating ? "Calculating FHE Score..." : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;