<img src="https://content.partnerpage.io/eyJidWNrZXQiOiJwYXJ0bmVycGFnZS5wcm9kIiwia2V5IjoibWVkaWEvY29udGFjdF9pbWFnZXMvMDUwNGZlYTYtOWIxNy00N2IyLTg1YjUtNmY5YTZjZWU5OTJiLzI1NjhmYjk4LTQwM2ItNGI2OC05NmJiLTE5YTg1MzU3ZjRlMS5wbmciLCJlZGl0cyI6eyJ0b0Zvcm1hdCI6IndlYnAiLCJyZXNpemUiOnsid2lkdGgiOjEyMDAsImhlaWdodCI6NjI3LCJmaXQiOiJjb250YWluIiwiYmFja2dyb3VuZCI6eyJyIjoyNTUsImciOjI1NSwiYiI6MjU1LCJhbHBoYSI6MH19fX0=" alt="AB Tasty logo" width="350"/>

# 📈 Sending Feature Flag Data from Server-Side (SSR) to Google Analytics 4 (GA4)

This project integrates **Google Analytics 4 (GA4)** directly in the `root.tsx` file to track user interactions across the app. The tracking code is inserted in the `<head>` of the HTML using the standard GA4 script.

---

## ✅ Implementation Details

The GA4 snippet is injected using app’s server-rendered `head` logic. Here's how it works:

### 1. Loading the GA4 Script Asynchronously

```tsx
<script
  async
  src={`https://www.googletagmanager.com/gtag/js?id=\${GA_MEASUREMENT_ID}`}
  crossOrigin="anonymous"
/>
```

### 2. Initializing GA4 with `debug_mode: true`

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: \`
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '\${GA_MEASUREMENT_ID}', {
        debug_mode: true
      });
    \`,
  }}
/>
```

> ⚠️ Only use `debug_mode: true` in development to avoid polluting production analytics.

---

## ⚙️ Environment Variable Setup

```ts
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || "G-XXXXXXXXXX";
```

```env
GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

---

## 🧪 Viewing Debug Data in GA4

1. Open GA4 property
2. Go to **Admin > DebugView**
3. Interact with your app locally
4. View events in real-time

---

## 🚩 Server-Side Feature Flag Evaluation (SSR)

This app uses [AB Tasty's Flagship SDK](https://docs.abtasty.com/flagship/) to resolve feature flags on the server.

### 📦 Where It's Done

In [`utils/flagship.server.ts`](./utils/flagship.server.ts):
- Initializes SDK
- Creates a visitor with full context
- Fetches flags server-side

---

### 🧠 Why SSR Feature Flags?

✅ Flags ready before render (no flickering)  
✅ Easier end-to-end testing  
✅ No additional client-side tracking needed

---

### 🛠️ How It Works

#### 1. Initializing the SDK

```ts
Flagship.start(envId, apiKey, {
  fetchNow: false,
  decisionMode: DecisionMode.DECISION_API,
  logLevel: LogLevel.INFO,
});
```

#### 2. Creating a Visitor & Fetching Flags

```ts
const visitor = flagship.newVisitor({
  visitorId: 'visitor_1234',
  hasConsented: true,
  context: {
    Session: "Returning",
    UserType: "Premium",
    someNumber: 42,
  },
});

await visitor.fetchFlags();
```

---

## 🔁 End-to-End SSR to Client Flow with Feature Flags and GA4

This app delivers a full SSR-to-client journey:

---

### 🧠 1. Server-Side Feature Evaluation in `loader`

- Extracts query parameters (e.g., `?UserType=Premium`)
- Initializes Flagship visitor with context
- Fetches flags & recommendation data
- Passes all info to the client

#### Example:

```ts
const visitor = await getFsVisitorData({
  id: "user123",
  hasConsented: true,
  context: {
    Session: "Active",
    UserType: "Premium",
    someNumber: 42
  },
});

const flag = visitor.getFlag("flagProductRecs");
const flagValue = flag?.getValue("fallback-uuid");
```

---

### 🚩 Dynamically Modify User Context via URL Query Parameters

You can dynamically simulate different user contexts — and flag values — by passing them in the URL.

#### ✅ Example URL:

```
https://ssr-feature-flag-remix-run.vercel.app/?Session=Returning&UserType=Premium&someNumber=7
```

This maps directly to the Flagship visitor context:

```ts
context: {
  Session: "Active",
  UserType: "Premium",
  someNumber: 42
}
```

#### 🔄 Benefits

- Simulate any user profile without changing code
- See different flag variations instantly
- Easier QA for multiple segmentation scenarios
- Enables real-world use case simulations for stakeholders

> Try `?Session=Returning&UserType=Premium&someNumber=7` to see a different variation.

---

### 🎯 2. Feature Execution on the Client

```tsx
const {
  flagKey,
  visitorId,
  flagMetadata,
  products,
  flagValue,
  ...
} = useLoaderData<LoaderData>();
```

If `flagValue` is valid, personalized product recommendations are rendered **immediately** without additional fetching:

```ts
const recoUrl = `https://uc-info.eu.abtasty.com/v1/reco/${process.env.SITE_ID}/recos/${flagValue}?variables=${query}&fields=${fields}`;
```

---

### 📊 3. GA4 Event Tracking for A/B Exposure

After rendering, send experiment data to GA4:

```tsx
window.gtag("event", "ab_test_view", {
  campaign_id: flagMetadata.campaignId,
  campaign_name: flagMetadata.campaignName,
  campaign_type: flagMetadata.campaignType,
  flag_key: flagKey,
  visitor_id: visitorId,
});
```

---

## 🔒 Required Environment Variables

```env
GA_MEASUREMENT_ID=G-XXXXXXXXXX
FS_ENV_ID=xxxxxxxxxxxxxxxx
FS_API_KEY=xxxxxxxxxxxxxxxx
SITE_ID=xxxxxxxxx
RECS_BEARER=your_bearer_token
```

---

## 🧪 Debugging Tips

- Use `logLevel: LogLevel.DEBUG` in development
- Watch GA4 DebugView while interacting
- Log flag values and visitor ID from the loader

---

## 🧵 Summary of the Flow

| Stage         | Action                                                                 |
|---------------|------------------------------------------------------------------------|
| Loader (SSR)  | Parse URL params → Init SDK → Fetch Flag → Fetch Recos                 |
| Output        | `flagValue`, `products`, `visitorId`, `campaignId`, `context`          |
| Client        | Render UI using server-evaluated flag                                  |
| GA4 Tracking  | Send `ab_test_view` event with campaign metadata                       |
| QA            | Test any scenario via query parameters in the browser                  |