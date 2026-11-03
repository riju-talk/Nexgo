// Source: "API Terms of Use" supplied by the client (Word document). Edit the text here; the page renders it as is.
// Text in [SQUARE BRACKETS] is a blank the client still has to fill in (see lib/legal/company.js).
export const api = {
  "title": "API Terms of Use",
  "effective": "15 Aug 2026",
  "updated": "15 Aug 2026",
  "intro": [
    {
      "t": "p",
      "text": "These API Terms of Use (“API Terms”) govern your access to and use of APIs, webhooks, SDKs, developer tools, documentation and related technical services provided by Nexgo (“Nexgo”, “we”, “us”, “our”)."
    },
    {
      "t": "p",
      "text": "These API Terms form part of the Nexgo Terms of Service. By requesting API access, generating API credentials, integrating with Nexgo APIs, or making API requests, you agree to these API Terms."
    }
  ],
  "sections": [
    {
      "n": 1,
      "title": "What Nexgo API Provides",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo APIs may allow approved merchants and technology partners to programmatically access logistics functionality, including:"
        },
        {
          "t": "ul",
          "items": [
            "Create shipments",
            "Cancel shipments",
            "Generate AWBs",
            "Generate shipping labels",
            "Generate manifests",
            "Check shipment status",
            "Track shipments",
            "Fetch courier information",
            "Check pincode serviceability",
            "Calculate shipping rates",
            "Manage NDR",
            "Manage RTO",
            "Create reverse shipments",
            "Access COD information",
            "Retrieve invoices",
            "Access reports",
            "Receive shipment updates through webhooks",
            "Other logistics functionality made available by Nexgo"
          ]
        },
        {
          "t": "p",
          "text": "The specific API features available to you depend on your account, subscription, integration and applicable Nexgo documentation."
        }
      ]
    },
    {
      "n": 2,
      "title": "API Access",
      "blocks": [
        {
          "t": "p",
          "text": "API access may be provided only after Nexgo approves your account or integration."
        },
        {
          "t": "p",
          "text": "Nexgo may provide:"
        },
        {
          "t": "ul",
          "items": [
            "API keys",
            "Client IDs",
            "Client secrets",
            "Access tokens",
            "Webhook credentials",
            "Sandbox credentials",
            "Production credentials"
          ]
        },
        {
          "t": "p",
          "text": "You must use API credentials only for the account and purpose for which they were issued."
        },
        {
          "t": "p",
          "text": "Nexgo may refuse, suspend or revoke API access where necessary for security, compliance, operational or commercial reasons."
        }
      ]
    },
    {
      "n": 3,
      "title": "Developer Account",
      "blocks": [
        {
          "t": "p",
          "text": "You are responsible for maintaining accurate information associated with your developer or merchant account."
        },
        {
          "t": "p",
          "text": "You must promptly update:"
        },
        {
          "t": "ul",
          "items": [
            "Business information",
            "Contact information",
            "Technical contact",
            "Authorized users",
            "Integration information",
            "Other relevant account details"
          ]
        },
        {
          "t": "p",
          "text": "You must ensure that only authorized personnel have access to your Nexgo API credentials."
        }
      ]
    },
    {
      "n": 4,
      "title": "API Credentials",
      "blocks": [
        {
          "t": "p",
          "text": "API credentials are confidential."
        },
        {
          "t": "p",
          "text": "You must:"
        },
        {
          "t": "ul",
          "items": [
            "Store credentials securely",
            "Restrict access to authorized personnel",
            "Use appropriate encryption and security controls",
            "Rotate credentials where necessary",
            "Immediately report compromised credentials",
            "You must not:",
            "Publish API keys publicly",
            "Upload credentials to public GitHub repositories",
            "Include secrets in client-side applications where avoidable",
            "Share credentials with unauthorized third parties",
            "Sell or transfer API credentials"
          ]
        },
        {
          "t": "p",
          "text": "If you believe your credentials have been compromised, notify Nexgo immediately."
        },
        {
          "t": "p",
          "text": "Nexgo may deactivate compromised credentials and issue replacement credentials."
        }
      ]
    },
    {
      "n": 5,
      "title": "Sandbox and Production",
      "blocks": [
        {
          "t": "p",
          "text": "Where provided, Nexgo may offer separate:"
        },
        {
          "t": "h",
          "text": "Sandbox Environment"
        },
        {
          "t": "p",
          "text": "Used for:"
        },
        {
          "t": "ul",
          "items": [
            "Development",
            "Testing",
            "Integration",
            "Debugging"
          ]
        },
        {
          "t": "p",
          "text": "Sandbox data may not represent actual production performance or availability."
        },
        {
          "t": "h",
          "text": "Production Environment"
        },
        {
          "t": "p",
          "text": "Used for live shipments and real customer transactions."
        },
        {
          "t": "p",
          "text": "You are responsible for testing your integration before sending production requests."
        }
      ]
    },
    {
      "n": 6,
      "title": "API Documentation",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may provide technical documentation describing:"
        },
        {
          "t": "ul",
          "items": [
            "Endpoints",
            "Request methods",
            "Parameters",
            "Authentication",
            "Response formats",
            "Error codes",
            "Webhooks",
            "Rate limits",
            "Integration requirements"
          ]
        },
        {
          "t": "p",
          "text": "Nexgo may update its documentation from time to time."
        },
        {
          "t": "p",
          "text": "You are responsible for using the latest version of the documentation."
        }
      ]
    },
    {
      "n": 7,
      "title": "Permitted API Usage",
      "blocks": [
        {
          "t": "p",
          "text": "You may use Nexgo APIs only to:"
        },
        {
          "t": "ul",
          "items": [
            "Integrate your business systems with Nexgo",
            "Automate legitimate shipping operations",
            "Manage your own shipments",
            "Manage shipments for customers you are authorized to represent",
            "Access information available to your account",
            "Perform other activities expressly authorized by Nexgo"
          ]
        },
        {
          "t": "p",
          "text": "Your API usage must comply with all applicable laws and the Nexgo Terms of Service."
        }
      ]
    },
    {
      "n": 8,
      "title": "Prohibited API Activities",
      "blocks": [
        {
          "t": "p",
          "text": "You must not use Nexgo APIs to:"
        },
        {
          "t": "ul",
          "items": [
            "Gain unauthorized access",
            "Access another user's data",
            "Circumvent security controls",
            "Probe or scan Nexgo systems",
            "Reverse engineer Nexgo APIs",
            "Extract data beyond your authorization",
            "Scrape Nexgo services",
            "Create fake shipments",
            "Manipulate tracking information",
            "Abuse COD services",
            "Circumvent billing",
            "Circumvent rate limits",
            "Perform denial-of-service attacks",
            "Introduce malware",
            "Upload malicious code",
            "Conduct fraudulent activity",
            "Resell API access without authorization",
            "Use the API for unlawful activities"
          ]
        }
      ]
    },
    {
      "n": 9,
      "title": "Rate Limits",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may impose API rate limits to maintain platform stability and security."
        },
        {
          "t": "p",
          "text": "Rate limits may apply to:"
        },
        {
          "t": "ul",
          "items": [
            "Requests per second",
            "Requests per minute",
            "Requests per hour",
            "Daily requests",
            "Specific API endpoints",
            "Account-level usage"
          ]
        },
        {
          "t": "p",
          "text": "Your application must handle rate-limit responses appropriately."
        },
        {
          "t": "p",
          "text": "Nexgo may temporarily restrict or suspend API access where excessive traffic threatens platform performance."
        }
      ]
    },
    {
      "n": 10,
      "title": "Fair Usage",
      "blocks": [
        {
          "t": "p",
          "text": "API access must be used responsibly."
        },
        {
          "t": "p",
          "text": "You must not generate unnecessary requests, including repeated requests that could reasonably be avoided through:"
        },
        {
          "t": "ul",
          "items": [
            "Caching",
            "Webhooks",
            "Pagination",
            "Incremental synchronization",
            "Appropriate retry logic"
          ]
        },
        {
          "t": "p",
          "text": "Where Nexgo provides webhooks for shipment updates, you should use webhooks instead of repeatedly polling APIs where reasonably possible."
        }
      ]
    },
    {
      "n": 11,
      "title": "Retry Policy",
      "blocks": [
        {
          "t": "p",
          "text": "Your application should use reasonable retry mechanisms."
        },
        {
          "t": "p",
          "text": "You should avoid repeatedly retrying failed requests without appropriate delays."
        },
        {
          "t": "p",
          "text": "For temporary failures, you should use an appropriate exponential backoff strategy."
        },
        {
          "t": "p",
          "text": "You should not repeatedly retry requests that have received a permanent error response."
        }
      ]
    },
    {
      "n": 12,
      "title": "Idempotency",
      "blocks": [
        {
          "t": "p",
          "text": "Where Nexgo provides idempotency functionality, you should use idempotency keys for operations where duplicate requests could result in duplicate transactions or shipments."
        },
        {
          "t": "p",
          "text": "For example:"
        },
        {
          "t": "ul",
          "items": [
            "Shipment creation",
            "Pickup requests",
            "Reverse shipment creation",
            "Other transaction-based operations"
          ]
        },
        {
          "t": "p",
          "text": "You are responsible for designing your integration to minimize accidental duplicate operations."
        }
      ]
    },
    {
      "n": 13,
      "title": "Shipment Creation",
      "blocks": [
        {
          "t": "p",
          "text": "When creating a Shipment through the API, you must provide accurate information."
        },
        {
          "t": "p",
          "text": "This may include:"
        },
        {
          "t": "ul",
          "items": [
            "Sender information",
            "Receiver information",
            "Address",
            "Pincode",
            "Product details",
            "Product value",
            "Weight",
            "Dimensions",
            "Payment mode",
            "COD amount",
            "Invoice information",
            "Other required fields"
          ]
        },
        {
          "t": "p",
          "text": "You must not submit false, misleading or fraudulent information."
        }
      ]
    },
    {
      "n": 14,
      "title": "Customer Data",
      "blocks": [
        {
          "t": "p",
          "text": "Your API integration may process personal information belonging to your customers."
        },
        {
          "t": "p",
          "text": "This may include:"
        },
        {
          "t": "ul",
          "items": [
            "Customer name",
            "Phone number",
            "Email address",
            "Delivery address",
            "Order information",
            "Shipment information"
          ]
        },
        {
          "t": "p",
          "text": "You must have the appropriate legal authority to provide such information to Nexgo."
        },
        {
          "t": "p",
          "text": "You must process customer information in accordance with applicable privacy and data-protection laws."
        }
      ]
    },
    {
      "n": 15,
      "title": "Data Security",
      "blocks": [
        {
          "t": "p",
          "text": "You are responsible for maintaining appropriate security measures for information received through Nexgo APIs."
        },
        {
          "t": "p",
          "text": "You should:"
        },
        {
          "t": "ul",
          "items": [
            "Encrypt sensitive information where appropriate",
            "Secure API credentials",
            "Restrict employee access",
            "Maintain access logs",
            "Monitor suspicious activity",
            "Use secure HTTPS connections",
            "Remove unnecessary stored data",
            "Protect webhook endpoints"
          ]
        },
        {
          "t": "p",
          "text": "You must notify Nexgo promptly if you discover a security incident involving Nexgo data or credentials."
        }
      ]
    },
    {
      "n": 16,
      "title": "Webhooks",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may provide webhook notifications for events such as:"
        },
        {
          "t": "ul",
          "items": [
            "Shipment created",
            "Pickup scheduled",
            "Pickup completed",
            "In transit",
            "Out for delivery",
            "Delivered",
            "NDR",
            "RTO",
            "RTO delivered",
            "Shipment cancelled",
            "COD updates",
            "Other shipment events"
          ]
        },
        {
          "t": "p",
          "text": "Webhook events may be delivered more than once."
        },
        {
          "t": "p",
          "text": "Your system should therefore be designed to safely handle duplicate events."
        }
      ]
    },
    {
      "n": 17,
      "title": "Webhook Security",
      "blocks": [
        {
          "t": "p",
          "text": "You are responsible for securing your webhook endpoints."
        },
        {
          "t": "p",
          "text": "Where Nexgo provides webhook signatures or authentication mechanisms, you should verify them before processing webhook requests."
        },
        {
          "t": "p",
          "text": "You should not expose webhook endpoints unnecessarily."
        },
        {
          "t": "p",
          "text": "You should also protect your system against:"
        },
        {
          "t": "ul",
          "items": [
            "Replay attacks",
            "Duplicate events",
            "Unauthorized requests",
            "Malformed payloads",
            "Excessive requests"
          ]
        }
      ]
    },
    {
      "n": 18,
      "title": "API Response Data",
      "blocks": [
        {
          "t": "p",
          "text": "Information returned through the Nexgo API may be confidential or subject to restrictions."
        },
        {
          "t": "p",
          "text": "You may use API response data only for legitimate purposes connected with your Nexgo account and authorized integration."
        },
        {
          "t": "p",
          "text": "You must not:"
        },
        {
          "t": "ul",
          "items": [
            "Sell Nexgo data",
            "Create unauthorized databases",
            "Publish private shipment information",
            "Share customer information without authorization",
            "Use data for unrelated purposes"
          ]
        }
      ]
    },
    {
      "n": 19,
      "title": "Data Retention",
      "blocks": [
        {
          "t": "p",
          "text": "You should retain API data only for as long as reasonably necessary for your legitimate business purpose or as required by applicable law."
        },
        {
          "t": "p",
          "text": "Where customer or personal information is no longer required, you should securely delete or anonymize it where appropriate."
        },
        {
          "t": "p",
          "text": "Nexgo may maintain API logs and records for security, operational, accounting, legal and compliance purposes."
        }
      ]
    },
    {
      "n": 20,
      "title": "Third-Party Integrations",
      "blocks": [
        {
          "t": "p",
          "text": "You may integrate Nexgo with third-party systems such as:"
        },
        {
          "t": "ul",
          "items": [
            "Ecommerce platforms",
            "Marketplaces",
            "ERP systems",
            "OMS systems",
            "WMS systems",
            "CRM systems",
            "Payment systems",
            "Other software"
          ]
        },
        {
          "t": "p",
          "text": "You are responsible for ensuring that your third-party integrations comply with applicable terms and privacy requirements."
        },
        {
          "t": "p",
          "text": "Nexgo is not responsible for failures caused solely by third-party systems."
        }
      ]
    },
    {
      "n": 21,
      "title": "API Changes",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may modify APIs from time to time."
        },
        {
          "t": "p",
          "text": "Changes may include:"
        },
        {
          "t": "ul",
          "items": [
            "New endpoints",
            "New fields",
            "New features",
            "Bug fixes",
            "Security improvements",
            "Performance improvements",
            "Deprecated endpoints"
          ]
        },
        {
          "t": "p",
          "text": "Nexgo may provide notice for material breaking changes where reasonably practicable."
        },
        {
          "t": "p",
          "text": "You are responsible for maintaining your integration."
        }
      ]
    },
    {
      "n": 22,
      "title": "API Versioning",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may provide versioned APIs."
        },
        {
          "t": "p",
          "text": "For example: v1, v2, v3."
        },
        {
          "t": "p",
          "text": "You should use the version specified in Nexgo's current API documentation."
        },
        {
          "t": "p",
          "text": "Nexgo may eventually deprecate older API versions."
        },
        {
          "t": "p",
          "text": "Where applicable, Nexgo may provide a migration period before discontinuing an older version."
        }
      ]
    },
    {
      "n": 23,
      "title": "API Availability",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo aims to maintain reliable API availability but does not guarantee that APIs will always be:"
        },
        {
          "t": "ul",
          "items": [
            "Available",
            "Uninterrupted",
            "Error-free",
            "Free from latency",
            "Free from maintenance periods",
            "Nexgo may temporarily restrict API availability for:",
            "Maintenance",
            "Security",
            "Upgrades",
            "Emergency situations",
            "Infrastructure changes",
            "Regulatory requirements"
          ]
        }
      ]
    },
    {
      "n": 24,
      "title": "API Errors",
      "blocks": [
        {
          "t": "p",
          "text": "API responses may include errors caused by:"
        },
        {
          "t": "ul",
          "items": [
            "Invalid authentication",
            "Invalid parameters",
            "Missing information",
            "Unauthorized access",
            "Rate limits",
            "Service unavailability",
            "Shipment status restrictions",
            "Courier Partner errors",
            "Other technical or operational conditions"
          ]
        },
        {
          "t": "p",
          "text": "Your application must handle API errors appropriately."
        }
      ]
    },
    {
      "n": 25,
      "title": "Courier Partner Data",
      "blocks": [
        {
          "t": "p",
          "text": "Some API responses may contain information received from third-party Courier Partners."
        },
        {
          "t": "p",
          "text": "Such information may:"
        },
        {
          "t": "ul",
          "items": [
            "Change over time",
            "Be delayed",
            "Be incomplete",
            "Be subject to Courier Partner systems",
            "Be unavailable temporarily"
          ]
        },
        {
          "t": "p",
          "text": "Nexgo does not guarantee that all third-party information will always be accurate or available in real time."
        }
      ]
    },
    {
      "n": 26,
      "title": "API Charges",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may charge fees for certain API usage or services."
        },
        {
          "t": "p",
          "text": "Applicable charges may include:"
        },
        {
          "t": "ul",
          "items": [
            "API subscription fees",
            "Transaction fees",
            "Shipment charges",
            "Premium API charges",
            "Excess usage charges",
            "Other applicable fees"
          ]
        },
        {
          "t": "p",
          "text": "Any applicable pricing will be communicated through the relevant commercial plan, rate card or agreement."
        }
      ]
    },
    {
      "n": 27,
      "title": "No Circumvention",
      "blocks": [
        {
          "t": "p",
          "text": "You must not use APIs or technical methods to circumvent:"
        },
        {
          "t": "ul",
          "items": [
            "Shipping charges",
            "Account restrictions",
            "Rate limits",
            "Courier restrictions",
            "Subscription limits",
            "Security controls",
            "Usage limits",
            "Other Nexgo controls"
          ]
        },
        {
          "t": "p",
          "text": "Attempts to circumvent such controls may result in immediate suspension."
        }
      ]
    },
    {
      "n": 28,
      "title": "Security Testing",
      "blocks": [
        {
          "t": "p",
          "text": "You must not conduct penetration testing, vulnerability scanning, load testing or other security testing against Nexgo APIs without prior written authorization."
        },
        {
          "t": "p",
          "text": "If you identify a security vulnerability, report it to:"
        },
        {
          "t": "kv",
          "rows": [
            [
              "Security email",
              "[SECURITY@NEXGO DOMAIN]"
            ]
          ]
        },
        {
          "t": "p",
          "text": "Please do not publicly disclose the vulnerability before Nexgo has had a reasonable opportunity to investigate and address it."
        }
      ]
    },
    {
      "n": 29,
      "title": "Intellectual Property",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo retains all rights in:"
        },
        {
          "t": "ul",
          "items": [
            "APIs",
            "API architecture",
            "Documentation",
            "SDKs",
            "Software",
            "Endpoints",
            "Data structures",
            "Nexgo trademarks",
            "Nexgo branding"
          ]
        },
        {
          "t": "p",
          "text": "Your use of the API does not transfer ownership of Nexgo intellectual property to you."
        }
      ]
    },
    {
      "n": 30,
      "title": "SDKs and Developer Tools",
      "blocks": [
        {
          "t": "p",
          "text": "Where Nexgo provides SDKs, libraries or developer tools, they are provided for authorized integration purposes."
        },
        {
          "t": "p",
          "text": "You must not:"
        },
        {
          "t": "ul",
          "items": [
            "Modify them to bypass security",
            "Remove license notices",
            "Redistribute proprietary components without permission",
            "Use them for unlawful purposes"
          ]
        }
      ]
    },
    {
      "n": 31,
      "title": "Branding",
      "blocks": [
        {
          "t": "p",
          "text": "You may not represent your application or service as being owned, operated or officially endorsed by Nexgo unless Nexgo has provided written authorization."
        },
        {
          "t": "p",
          "text": "Use of the Nexgo name, logo or trademarks must comply with Nexgo's brand guidelines."
        }
      ]
    },
    {
      "n": 32,
      "title": "API Suspension",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may suspend API access if:"
        },
        {
          "t": "ul",
          "items": [
            "Credentials are compromised",
            "Unusual traffic is detected",
            "Rate limits are repeatedly violated",
            "Security risks are identified",
            "Fraud is suspected",
            "The account violates these Terms",
            "Payments remain overdue",
            "Required KYC is incomplete",
            "The API is used unlawfully",
            "Suspension is required for security or compliance"
          ]
        },
        {
          "t": "p",
          "text": "Nexgo may restore access after the relevant issue has been resolved."
        }
      ]
    },
    {
      "n": 33,
      "title": "API Termination",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may terminate API access or discontinue an API where reasonably necessary."
        },
        {
          "t": "p",
          "text": "Upon termination, you must:"
        },
        {
          "t": "ul",
          "items": [
            "Stop making API requests",
            "Stop using Nexgo credentials",
            "Remove credentials from your systems",
            "Stop representing the integration as active",
            "Handle stored data according to applicable requirements"
          ]
        },
        {
          "t": "p",
          "text": "Termination does not remove outstanding financial or legal obligations."
        }
      ]
    },
    {
      "n": 34,
      "title": "Indemnification",
      "blocks": [
        {
          "t": "p",
          "text": "You agree to indemnify and hold harmless Nexgo, its affiliates, officers, employees, agents and service providers against claims, losses, damages, liabilities and expenses arising from:"
        },
        {
          "t": "ul",
          "items": [
            "Your API usage",
            "Your violation of these API Terms",
            "Unauthorized access caused by your security failure",
            "Misuse of customer information",
            "Fraudulent API activity",
            "Violation of applicable law",
            "Your application or integration",
            "Intellectual property infringement",
            "Unauthorized use of Nexgo data"
          ]
        }
      ]
    },
    {
      "n": 35,
      "title": "Limitation of Liability",
      "blocks": [
        {
          "t": "p",
          "text": "To the maximum extent permitted by applicable law, Nexgo shall not be liable for indirect, incidental, special, consequential or punitive damages arising from API use."
        },
        {
          "t": "p",
          "text": "Nexgo shall not be responsible for losses caused solely by:"
        },
        {
          "t": "ul",
          "items": [
            "Your application",
            "Your infrastructure",
            "Third-party integrations",
            "Internet connectivity",
            "Courier Partner systems",
            "Incorrect API implementation",
            "Failure to securely store credentials"
          ]
        },
        {
          "t": "p",
          "text": "Nothing in these API Terms excludes liability that cannot legally be excluded."
        }
      ]
    },
    {
      "n": 36,
      "title": "Confidentiality",
      "blocks": [
        {
          "t": "p",
          "text": "Information exchanged through the Nexgo API that is confidential or reasonably understood to be confidential must be protected from unauthorized disclosure."
        },
        {
          "t": "p",
          "text": "You must not disclose confidential Nexgo technical information except to authorized personnel who need it for the integration."
        }
      ]
    },
    {
      "n": 37,
      "title": "Compliance With Laws",
      "blocks": [
        {
          "t": "p",
          "text": "You must use Nexgo APIs in compliance with all applicable laws and regulations, including those relating to:"
        },
        {
          "t": "ul",
          "items": [
            "Data protection",
            "Privacy",
            "Cybersecurity",
            "Consumer protection",
            "Taxation",
            "Logistics",
            "E-commerce",
            "Telecommunications",
            "Fraud prevention"
          ]
        },
        {
          "t": "p",
          "text": "You are responsible for determining which laws apply to your business."
        }
      ]
    },
    {
      "n": 38,
      "title": "Changes to API Terms",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may update these API Terms from time to time."
        },
        {
          "t": "p",
          "text": "The latest version will be published on the Nexgo website or developer portal."
        },
        {
          "t": "p",
          "text": "Where required, Nexgo may provide notice of material changes."
        },
        {
          "t": "p",
          "text": "Continued API usage after the effective date of updated Terms constitutes acceptance of the revised Terms, to the extent permitted by law."
        }
      ]
    },
    {
      "n": 39,
      "title": "Governing Law",
      "blocks": [
        {
          "t": "p",
          "text": "These API Terms shall be governed by the laws of India."
        },
        {
          "t": "p",
          "text": "Subject to applicable law, courts located in [CITY, STATE, INDIA] shall have jurisdiction."
        }
      ]
    },
    {
      "n": 40,
      "title": "Dispute Resolution",
      "blocks": [
        {
          "t": "p",
          "text": "The parties will first attempt to resolve disputes through good-faith discussions."
        },
        {
          "t": "p",
          "text": "If the dispute cannot be resolved amicably, it may be referred to arbitration in accordance with applicable Indian law."
        },
        {
          "t": "kv",
          "rows": [
            [
              "Seat of arbitration",
              "[CITY, INDIA]"
            ],
            [
              "Language",
              "English"
            ],
            [
              "Number of arbitrators",
              "One"
            ]
          ]
        }
      ]
    },
    {
      "n": 41,
      "title": "Relationship With Other Nexgo Policies",
      "blocks": [
        {
          "t": "p",
          "text": "These API Terms should be read together with:"
        },
        {
          "t": "ul",
          "items": [
            "Nexgo Terms of Service",
            "Nexgo Privacy Policy",
            "Nexgo Cookie Policy",
            "Nexgo Merchant Agreement",
            "Nexgo Prohibited Items Policy",
            "Nexgo Claims Policy",
            "Nexgo Shipping & Packaging SOP",
            "Nexgo API Documentation",
            "Applicable pricing/rate card"
          ]
        },
        {
          "t": "p",
          "text": "If there is a conflict, the specific agreement or API documentation applicable to the relevant service may prevail to the extent stated therein."
        }
      ]
    },
    {
      "n": 42,
      "title": "Acceptance",
      "blocks": [
        {
          "t": "p",
          "text": "By requesting API access, generating API credentials, connecting your application to Nexgo, or making API requests, you acknowledge that you have read, understood and accepted these API Terms of Use."
        }
      ]
    }
  ]
};
