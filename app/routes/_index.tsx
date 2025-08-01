// app/routes/index.tsx

import { json, LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { getFsVisitorData, getFsVisitorData2, getFsVisitorData3, getFlagshipLogs } from "../utils/flagship.server";
import React, { useEffect, useRef, useState } from "react";

import { v4 as uuidv4 } from "uuid";

// Type definitions for product and loader data
interface Product {
  id: string;
  name: string;
  img_link: string;
  price: string | number | null;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

type Props = {
  flagshipLogs: LogEntry[];
};

const formatTimestamp = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return new Date().toLocaleTimeString('en-GB', { hour12: false });
  }
  return d.toLocaleTimeString('en-GB', { hour12: false });
};

interface LoaderData {
  products: Product[];
  flagValue?: string;
  customAccountValue: string | null;
  blockName: string;
  visitorId: string;
  flagKey: string;
  userContext: Record<string, any>;
  flagMetadata?: {
    campaignId?: string;
    campaignName?: string;
    campaignType?: string;
  };
  flagshipLogs: LogEntry[];
}

export const loader: LoaderFunction = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const customFlagValue = url.searchParams.get("flagValue") || undefined;
    const customAccountValue = String(url.searchParams.get("accountValue") ?? "");

    // Extract other query params for context update (handle boolean/number parsing)
    const contextParams: Record<string, string | number | boolean> = {};
    url.searchParams.forEach((value, key) => {
      if (key === "flagValue" || key === "accountValue") return;

      if (value === "true") {
        contextParams[key] = true;
      } else if (value === "false") {
        contextParams[key] = false;
      } else if (!isNaN(Number(value)) && value.trim() !== "") {
        contextParams[key] = Number(value);
      } else {
        contextParams[key] = value;
      }
    });

    const visitorId = uuidv4();

    if (!process.env.SITE_ID || !process.env.RECS_BEARER) {
      throw new Error("Missing SITE_ID or RECS_BEARER environment variables");
    }

    type AccountKey = "account-1" | "account-2" | "account-3";
    type VisitorData = any;
    type Visitor = any;
    const accountLoaders: Record<AccountKey, {
      loader: (data: VisitorData) => Promise<Visitor>;
    }> = {
      "account-1": {
        loader: getFsVisitorData,
      },
      "account-2": {
        loader: getFsVisitorData2,
      },
      "account-3": {
        loader: getFsVisitorData3,
      },
    };

    let accountKey: AccountKey = "account-1";
    if (customAccountValue === "account-2") {
      accountKey = "account-2";
    } else if (customAccountValue === "account-3") {
      accountKey = "account-3";
    }
    const { loader } = accountLoaders[accountKey];

    // Load visitor initially with base context
    const visitor = await loader({
      id: visitorId,
      hasConsented: true,
      context: {
        Session: "Returning",
      },
    });

    // Update visitor context with URL params if any
    if (Object.keys(contextParams).length > 0) {
      visitor.updateContext(contextParams);
      await visitor.fetchFlags();
    }

    const flag = visitor.getFlag("flagProductRecs");
    const fallbackFlagValue = flag?.getValue("07275641-4a2e-49b2-aa5d-bb4b7b8b2a4c");
    const flagValue = customFlagValue || fallbackFlagValue;
    const flagKey = (flag as any)?._key || "unknown";

    const query = JSON.stringify({ viewing_item: "456" });
    const fields = JSON.stringify(["id", "name", "img_link", "price"]);

    let products: Product[] = [];
    let blockName = "";

    if (flagValue) {
      try {
        const recoUrl = `https://uc-info.eu.abtasty.com/v1/reco/${process.env.SITE_ID}/recos/${flagValue}?variables=${encodeURIComponent(
          query
        )}&fields=${encodeURIComponent(fields)}`;

        const res = await fetch(recoUrl, {
          headers: {
            Authorization: `Bearer ${process.env.RECS_BEARER}`,
          },
        });

        if (!res.ok) {
          blockName = "Our Top Picks For You";
        } else {
          const data = await res.json();
          products = data.items || [];
          blockName = data.name || "Our Top Picks For You";
        }
      } catch (err) {
        blockName = "Our Top Picks For You";
      }
    } else {
      blockName = "Our Top Picks For You";
    }

    const flagMetadata = {
      campaignId: flag?.metadata.campaignId,
      campaignName: flag?.metadata.campaignName,
      campaignType: flag?.metadata.campaignType,
    };

    // Get flagship logs
    const flagshipLogs = getFlagshipLogs();

    return json<LoaderData>(
      {
        products,
        flagValue,
        blockName,
        visitorId,
        customAccountValue,
        flagKey,
        userContext: visitor.context,
        flagMetadata: {
          campaignId: flagMetadata.campaignId,
          campaignName: flagMetadata.campaignName,
          campaignType: flagMetadata.campaignType,
        },
        flagshipLogs,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=15, stale-while-revalidate=15",
        },
      }
    );
  } catch (error) {
    return json<LoaderData>({
      products: [],
      flagValue: undefined,
      blockName: "Our Top Picks For You",
      visitorId: "",
      flagKey: "",
      customAccountValue: null,
      userContext: {},
      flagshipLogs: [],
    });
  }
};

// Main React component for the page
export default function Index() {
  const {
    flagKey,
    visitorId,
    flagMetadata,
    products,
    flagValue,
    blockName,
    customAccountValue,
    flagshipLogs,
  } = useLoaderData<LoaderData>();

  // GA4 event sending logic
  useEffect(() => {
    try {
      if (
        typeof window === "undefined" ||
        typeof window.gtag !== "function" ||
        !flagMetadata?.campaignId
      ) {
        return;
      }

      const eventData = {
        campaign_id: flagMetadata.campaignId,
        campaign_name: flagMetadata.campaignName,
        campaign_type: flagMetadata.campaignType,
        flag_key: flagKey,
        visitor_id: visitorId,
      };

      window.gtag("event", "ab_test_view", eventData);
    } catch (err) {
      // Silent error handling
    }
  }, [flagMetadata, flagKey, visitorId]);

  const carouselRef = useRef<HTMLDivElement>(null);
  const [account, setAccount] = useState(customAccountValue || undefined);
  const [showTextInput, setShowTextInput] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    if (customAccountValue) {
      setAccount(customAccountValue);
    }
  }, [customAccountValue]);

  // State for carousel scroll buttons
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Update scroll button state based on carousel position
  const updateScrollButtons = () => {
    if (!carouselRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  };

  // Update scroll buttons on mount and when products change
  useEffect(() => {
    updateScrollButtons();
    window.addEventListener("resize", updateScrollButtons);
    return () => {
      window.removeEventListener("resize", updateScrollButtons);
    };
  }, [products]);

  const cleanPrice = (price: string | number | null) => {
    if (price == null) return "";

    // Convert string to number safely, stripping non-numeric characters
    const num = typeof price === "string"
      ? parseFloat(price.replace(/[^\d.-]/g, ""))
      : price;

    if (isNaN(num)) return "";

    // Format with up to 2 decimals, no trailing .00 if unnecessary
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };



  return (
    <main className="min-h-screen flex flex-col bg-gray-50">
      {/* Developer Logs Section */}
      <div className="bg-gray-900 border-b border-gray-700">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V8zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" clipRule="evenodd" />
              </svg>
              <h2 className="text-sm font-mono font-semibold text-white">
                Server Logs
              </h2>
            </div>
            <div className="flex items-center space-x-2 text-xs text-gray-400">
              <span className="px-2 py-1 bg-gray-800 rounded">
                {flagshipLogs.length} entries
              </span>

            </div>
          </div>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-md transition-colors duration-150"
          >
            <span>{showLogs ? 'Hide' : 'Show'} Logs</span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showLogs ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {showLogs && (
          <section
            aria-label="Flagship Logs"
            className="border-t border-gray-700 bg-gray-950 w-full mx-auto flex flex-col rounded-md shadow-lg"
          >
            <div
              className="overflow-y-auto px-3 py-3 flex-grow min-h-[300px] max-h-[30vh]"
              style={{ scrollbarGutter: 'stable' }} // avoid layout shift when scrollbar appears
            >
              {flagshipLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <svg
                    className="w-10 h-10 mb-3 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-sm" role="status" aria-live="polite">
                    No logs available
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {flagshipLogs.slice().reverse().map((log, index) => {
                    const timestamp = formatTimestamp(log.timestamp);

                    return (
                      <article
                        key={index}
                        className="p-2 hover:bg-gray-900 rounded-md focus-within:ring-2 focus-within:ring-indigo-500"
                        role="listitem"
                        tabIndex={0}
                      >
                        <div>
                          <p className="text-green-400 text-sm font-mono break-words">
                            [{timestamp}] [{log.level}] {log.message}
                          </p>

                          {log.data && (
                            <details className="mt-2" aria-live="polite">
                              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300 select-none">
                                View data
                              </summary>
                              <pre className="mt-2 p-3 bg-gray-900 rounded-md text-xs text-gray-300 overflow-x-auto border border-gray-700 whitespace-pre-wrap max-h-48">
                                {JSON.stringify(log.data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {flagshipLogs.length > 0 && (
              <footer className="border-t border-gray-700 bg-gray-900 px-6 py-3 flex items-center text-xs text-gray-400 flex-shrink-0">
                {/* Add other footer elements here if needed */}
                <button
                  onClick={() => window.location.reload()}
                  className="ml-auto flex items-center space-x-2 hover:text-gray-300 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 rounded"
                  aria-label="Refresh logs"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Refresh</span>
                </button>
              </footer>
            )}
          </section>
        )}


      </div>

      {/* Recommendations Block */}
      <section aria-label="Product recommendations" className="p-8 py-10 flex flex-col">

        <h1 className="py-4 px-4 text-3xl font-bold mb-4 text-gray-900">{blockName}</h1>

        <div className="relative">
          {/* Gradient overlays for fade effect */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 h-full w-12 z-20 bg-gradient-to-r from-gray-50 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 h-full w-12 z-20 bg-gradient-to-l from-gray-50 to-transparent"
          />

          {/* Scroll buttons */}
          <button
            type="button"
            onClick={() => carouselRef.current?.scrollBy({ left: -300, behavior: "smooth" })}
            disabled={!canScrollLeft}
            aria-label="Scroll left"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-30 flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-300 shadow-md transition hover:bg-gray-100 hover:scale-110 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="h-6 w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => carouselRef.current?.scrollBy({ left: 300, behavior: "smooth" })}
            disabled={!canScrollRight}
            aria-label="Scroll right"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-300 shadow-md transition hover:bg-gray-100 hover:scale-110 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="h-6 w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Carousel */}
          <div
            ref={carouselRef}
            onScroll={updateScrollButtons}
            className="overflow-x-auto scroll-smooth pr-4"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none", whiteSpace: "nowrap" }}
            tabIndex={0}
            aria-label="Product carousel"
          >
            {/* Show message if no products */}
            {products.length === 0 && <p className="p-4 text-gray-500">No recommendations available at the moment.</p>}
            {/* Render each product as a card */}
            {products.map((product: Product) => (
              <article
                key={product.id}
                className="group inline-block min-w-[220px] max-w-[240px] bg-white/95 backdrop-blur-sm border border-gray-100 rounded-xl shadow-sm hover:shadow-xl hover:border-gray-200 transition-all duration-300 mx-3 align-top cursor-pointer overflow-hidden"
              >
                {/* Image container with loading state */}
                <div className="relative w-full h-40 bg-gray-50 rounded-t-xl overflow-hidden">
                  <img
                    src={product.img_link}
                    alt={product.name}
                    className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    width={240}
                    height={160}
                    decoding="async"
                    {...{ fetchpriority: "low" }}
                  />

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Add-to-cart logic here
                    }}
                    className="absolute top-4 p-1 right-4 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-md shadow-sm transition-all hover:scale-110 active:scale-95 group"
                    aria-label="Add to Bag"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-6 h-6 text-gray-600 transition-colors duration-200 group-hover:text-blue-600 group-active:text-blue-700"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M5 8h14l-1.4 11.2a2 2 0 01-2 1.8H8.4a2 2 0 01-2-1.8L5 8z" />
                      <path d="M16 8V6a4 4 0 00-8 0v2" />
                    </svg>
                  </button>

                  {/* Subtle overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </div>

                {/* Content */}
                <div className="px-5 py-4 space-y-2">
                  <h2 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors duration-200">
                    {product.name}
                  </h2>

                  <div className="flex items-center justify-between">
                    <p className="text-lg font-bold text-gray-900">
                      ${cleanPrice(product.price)}
                    </p>

                    {/* Subtle action indicator */}
                    <div className="w-6 h-6 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors duration-200">
                      <svg
                        className="w-3 h-3 text-gray-400 group-hover:text-blue-500 transition-colors duration-200"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Bottom accent line */}
                <div className="h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></div>
              </article>
            ))}

          </div>
        </div>

        {/* Floating bottom-right form for changing flag value */}
        <div className="fixed bottom-6 right-6 w-80 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-xl p-6 z-50 transition-all duration-200 hover:shadow-2xl">
          {showTextInput ? (
            <form method="get" className="space-y-4">
              {/* Manual Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">
                  AB Tasty Reco ID
                </label>
                <input
                  name="flagValue"
                  defaultValue="2e2c9992-2c5d-466a-bded-71cb2a059730"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-mono"
                  placeholder="Enter custom ID..."
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-150 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setShowTextInput(false)}
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-150"
                >
                  ← Back to presets
                </button>
              </div>
            </form>
          ) : (
            <form method="get" className="space-y-4">
              {/* Preset Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">
                  AB Tasty Reco ID
                </label>
                <select
                  name="flagValue"
                  defaultValue={flagValue ?? ""}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-mono"
                >
                  <option value="9174ac6d-6b74-4234-b412-7d2d0d4acdad">
                    9174ac6d...4acdad
                  </option>
                  <option value="b7c76816-dcf3-4c0c-9023-a80a3a348151">
                    b7c76816...348151
                  </option>
                  <option value="b24cc1cb-bf79-4784-b23b-0a66b3593509">
                    b24cc1cb...593509
                  </option>
                  <option value="e5570bbc-9f91-48ec-b0ec-5d6ab941e402">
                    e5570bbc...41e402
                  </option>
                  <option value="875bb146-4a9c-4e26-ab67-02b2ccb87ca1">
                    875bb146...cb87ca1
                  </option>
                  <option value="07275641-4a2e-49b2-aa5d-bb4b7b8b2a4c">
                    07275641...8b2a4c
                  </option>
                  <option value="2e2c9992-2c5d-466a-bded-71cb2a059730">
                    2e2c9992...059730
                  </option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-150 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setShowTextInput(true)}
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-150"
                >
                  Custom ID →
                </button>
              </div>
            </form>
          )}
        </div>

      </section>
    </main>
  );
}
