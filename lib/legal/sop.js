// Source: "Shipping SOP" supplied by the client (Word document). Edit the text here; the page renders it as is.
// Text in [SQUARE BRACKETS] is a blank the client still has to fill in (see lib/legal/company.js).
export const sop = {
  "title": "Shipping SOP",
  "effective": "14 August 2026",
  "updated": "14 August 2026",
  "intro": [
    {
      "t": "p",
      "text": "Nexgo is a technology-driven courier aggregation platform that enables businesses, D2C brands, marketplace sellers and online merchants to ship parcels through multiple courier partners from a single platform."
    },
    {
      "t": "p",
      "text": "This Shipping SOP defines the operational guidelines, documentation requirements, packaging standards, shipment handling procedures, claims process and service conditions applicable to shipments booked through Nexgo."
    },
    {
      "t": "p",
      "text": "Important: Courier-specific charges, serviceability, claim limits and TAT may vary depending on the selected carrier, shipment category, destination and applicable commercial agreement."
    }
  ],
  "sections": [
    {
      "n": 1,
      "title": "KYC & ACCOUNT VERIFICATION",
      "blocks": [
        {
          "t": "p",
          "text": "KYC (Know Your Customer) verification is mandatory before certain Nexgo services, including COD and other services where verification is required."
        },
        {
          "t": "p",
          "text": "Nexgo may verify the identity, business details and banking information of every merchant before activating or continuing shipping services."
        },
        {
          "t": "h",
          "text": "Types of Accounts"
        },
        {
          "t": "ul",
          "items": [
            "Individual / Sole Seller",
            "Proprietorship",
            "Partnership / LLP",
            "Private Limited / Public Limited Company",
            "Other eligible registered businesses"
          ]
        },
        {
          "t": "h",
          "text": "Individual Seller – Required Documents"
        },
        {
          "t": "ul",
          "items": [
            "PAN Card",
            "Government-issued identity proof",
            "Cancelled cheque / bank statement / passbook",
            "Address proof, where required"
          ]
        },
        {
          "t": "h",
          "text": "Proprietorship – Required Documents"
        },
        {
          "t": "ul",
          "items": [
            "GST Certificate, where applicable",
            "PAN Card",
            "Proprietor's identity proof",
            "Cancelled cheque / bank statement",
            "Business address proof, where required"
          ]
        },
        {
          "t": "h",
          "text": "Partnership / LLP – Required Documents"
        },
        {
          "t": "ul",
          "items": [
            "GST Certificate, where applicable",
            "PAN",
            "Partnership Deed / LLP Incorporation documents",
            "Identity documents of authorized partner/director",
            "Cancelled cheque",
            "Business address proof"
          ]
        },
        {
          "t": "h",
          "text": "Company – Required Documents"
        },
        {
          "t": "ul",
          "items": [
            "Certificate of Incorporation",
            "GST Certificate, where applicable",
            "Company PAN",
            "Identity documents of authorized directors",
            "Cancelled cheque / bank proof",
            "Other documents requested during verification"
          ]
        },
        {
          "t": "h",
          "text": "KYC Conditions"
        },
        {
          "t": "p",
          "text": "Information submitted on the Nexgo panel should match the supporting documents."
        },
        {
          "t": "p",
          "text": "Nexgo may request additional documents for verification."
        },
        {
          "t": "p",
          "text": "Incomplete, invalid, expired or mismatched documents may result in account/service restrictions."
        },
        {
          "t": "p",
          "text": "COD remittance may be withheld until KYC and banking details are successfully verified."
        },
        {
          "t": "p",
          "text": "Nexgo may suspend an account where fraudulent, suspicious or prohibited activity is identified."
        }
      ]
    },
    {
      "n": 2,
      "title": "SHIPPING PROCESS",
      "blocks": [
        {
          "t": "p",
          "text": "The standard Nexgo shipping workflow is:"
        },
        {
          "t": "h",
          "text": "Step 1 – Create Shipment"
        },
        {
          "t": "p",
          "text": "The merchant can create a shipment manually, through bulk upload or through an integrated sales channel/API."
        },
        {
          "t": "p",
          "text": "Required shipment information may include:"
        },
        {
          "t": "ul",
          "items": [
            "Consignor details",
            "Consignee name",
            "Complete delivery address",
            "Mobile number",
            "Pin code",
            "Product description",
            "Product value",
            "Dead weight",
            "Length",
            "Breadth",
            "Height",
            "Payment mode",
            "COD amount, where applicable",
            "Invoice details"
          ]
        },
        {
          "t": "h",
          "text": "Step 2 – Select Courier"
        },
        {
          "t": "p",
          "text": "Nexgo may display available courier partners based on:"
        },
        {
          "t": "ul",
          "items": [
            "Destination serviceability",
            "Shipment weight",
            "Shipment dimensions",
            "Delivery zone",
            "COD availability",
            "Pickup availability",
            "Courier performance",
            "Merchant preferences",
            "Applicable commercial rates"
          ]
        },
        {
          "t": "h",
          "text": "Step 3 – Generate AWB & Label"
        },
        {
          "t": "p",
          "text": "After courier selection, an AWB/shipment number and shipping label may be generated."
        },
        {
          "t": "p",
          "text": "The merchant must ensure that:"
        },
        {
          "t": "ul",
          "items": [
            "The correct label is attached to the correct package.",
            "AWB information is clearly visible.",
            "The package contains the correct product and invoice.",
            "Old shipping labels are removed or completely covered."
          ]
        },
        {
          "t": "h",
          "text": "Step 4 – Pickup"
        },
        {
          "t": "p",
          "text": "The package is handed over to the assigned courier partner at the registered pickup location."
        },
        {
          "t": "h",
          "text": "Step 5 – Transit & Delivery"
        },
        {
          "t": "p",
          "text": "The shipment moves through the courier network and is delivered to the consignee according to the applicable service level."
        },
        {
          "t": "h",
          "text": "Step 6 – COD Remittance"
        },
        {
          "t": "p",
          "text": "For COD shipments, the courier collects the amount from the consignee and the eligible amount is subsequently remitted to the merchant according to Nexgo's applicable COD settlement cycle."
        }
      ]
    },
    {
      "n": 3,
      "title": "FIRST-MILE / PICKUP SOP",
      "blocks": [
        {
          "t": "p",
          "text": "The following guidelines apply to pickup requests:"
        },
        {
          "t": "ul",
          "items": [
            "Pickup requests should be created with accurate pickup details.",
            "Packages must be packed and ready before the scheduled pickup.",
            "The merchant should provide the shipment label and required documents.",
            "If a pickup is not attempted within the applicable pickup TAT, the merchant may raise a support request.",
            "Pickup escalation timelines may vary according to the courier partner.",
            "Repeated pickup failures may require courier reallocation or a fresh pickup request.",
            "Pickup availability is subject to courier serviceability and manpower.",
            "Pickup from restricted locations, upper floors or special premises may be subject to courier-specific conditions or additional charges."
          ]
        }
      ]
    },
    {
      "n": 4,
      "title": "DELIVERY SOP",
      "blocks": [
        {
          "t": "p",
          "text": "Delivery is performed by the selected courier partner according to its operational network and service conditions."
        },
        {
          "t": "h",
          "text": "Delivery Attempt"
        },
        {
          "t": "p",
          "text": "The courier partner may make multiple delivery attempts depending on its operational policy."
        },
        {
          "t": "p",
          "text": "A shipment may be marked as:"
        },
        {
          "t": "ul",
          "items": [
            "Delivered",
            "Customer Not Available",
            "Customer Refused",
            "Address Incorrect",
            "Address Incomplete",
            "Customer Requested Reschedule",
            "Delivery Area Not Serviceable",
            "COD Amount Not Available",
            "Other applicable delivery exception"
          ]
        },
        {
          "t": "p",
          "text": "Additional delivery attempts, where applicable, may attract additional charges according to the courier partner's tariff."
        }
      ]
    },
    {
      "n": 5,
      "title": "RTO – RETURN TO ORIGIN",
      "blocks": [
        {
          "t": "p",
          "text": "A shipment may move to RTO when delivery cannot be completed."
        },
        {
          "t": "p",
          "text": "Possible reasons include:"
        },
        {
          "t": "ul",
          "items": [
            "Customer refusal",
            "Incorrect address",
            "Incomplete address",
            "Customer unavailable",
            "Customer unreachable",
            "Multiple unsuccessful delivery attempts",
            "COD refusal",
            "Pincode/serviceability issue",
            "Other courier-defined exceptions"
          ]
        },
        {
          "t": "p",
          "text": "RTO charges may apply according to the applicable courier partner and merchant rate card."
        },
        {
          "t": "p",
          "text": "The merchant is responsible for providing accurate consignee information to reduce avoidable RTO."
        }
      ]
    },
    {
      "n": 6,
      "title": "E-WAY BILL & SHIPPING DOCUMENTS",
      "blocks": [
        {
          "t": "p",
          "text": "Merchants are responsible for complying with applicable GST, e-way bill, invoice and transportation requirements."
        },
        {
          "t": "p",
          "text": "Where an e-way bill is legally required, the merchant must generate and provide a valid e-way bill before movement of the shipment."
        },
        {
          "t": "p",
          "text": "The merchant must ensure:"
        },
        {
          "t": "ul",
          "items": [
            "Invoice details are accurate.",
            "Product description is correct.",
            "Declared value is genuine.",
            "GST information is accurate.",
            "E-way bill details match the shipment.",
            "Required documents are available during transit.",
            "Nexgo may restrict or hold shipments where mandatory documentation is missing or appears incorrect."
          ]
        },
        {
          "t": "p",
          "text": "For current statutory requirements, merchants should refer to the applicable government regulations and the official e-way bill system."
        }
      ]
    },
    {
      "n": 7,
      "title": "PACKAGING SOP",
      "blocks": [
        {
          "t": "p",
          "text": "The merchant is responsible for ensuring that every shipment is properly packed before handover to the courier."
        },
        {
          "t": "p",
          "text": "Packaging must be suitable for:"
        },
        {
          "t": "ul",
          "items": [
            "Product weight",
            "Product dimensions",
            "Product fragility",
            "Transportation conditions",
            "Handling requirements",
            "Weather exposure",
            "Stacking and movement during transit"
          ]
        },
        {
          "t": "h",
          "text": "General Packaging Requirements"
        },
        {
          "t": "p",
          "text": "Before dispatch:"
        },
        {
          "t": "ul",
          "items": [
            "Inspect the outer package for damage.",
            "Do not use weak, wet or previously damaged boxes.",
            "Select an appropriately sized box.",
            "Minimise empty space inside the package.",
            "Use suitable cushioning material.",
            "Seal all openings securely.",
            "Ensure the shipping label is clearly visible."
          ]
        },
        {
          "t": "h",
          "text": "Recommended Corrugated Packaging"
        },
        {
          "t": "table",
          "head": [
            "Shipment type",
            "Recommended packaging"
          ],
          "rows": [
            [
              "Lightweight / non-fragile",
              "Suitable 3-ply corrugated box"
            ],
            [
              "Heavy / fragile",
              "Suitable 5-ply or stronger box"
            ],
            [
              "Very heavy shipments",
              "Strong multi-ply / specialised packaging"
            ],
            [
              "High-value products",
              "Tamper-evident / additional protective packaging"
            ],
            [
              "Machinery / equipment",
              "Reinforced packaging or wooden protection where appropriate"
            ]
          ]
        },
        {
          "t": "p",
          "text": "These are general recommendations. The actual packaging strength should be selected according to the product and carrier requirements."
        }
      ]
    },
    {
      "n": 8,
      "title": "LIQUID PRODUCT PACKAGING",
      "blocks": [
        {
          "t": "p",
          "text": "Liquid shipments require additional protection against leakage."
        },
        {
          "t": "p",
          "text": "Recommended procedure:"
        },
        {
          "t": "ul",
          "items": [
            "Secure the bottle/container cap.",
            "Use leak-proof sealing where appropriate.",
            "Place the product inside a sealed plastic/zip-lock pouch.",
            "Add sufficient absorbent/cushioning material.",
            "Place the product inside a suitable secondary box.",
            "Fill empty space to prevent movement.",
            "Seal the outer package securely.",
            "Apply appropriate handling labels.",
            "The merchant remains responsible for ensuring the package is leak-proof before handover."
          ]
        }
      ]
    },
    {
      "n": 9,
      "title": "FRAGILE SHIPMENTS",
      "blocks": [
        {
          "t": "p",
          "text": "Fragile products must be packed with adequate internal cushioning."
        },
        {
          "t": "p",
          "text": "Recommended materials include:"
        },
        {
          "t": "ul",
          "items": [
            "Bubble wrap",
            "Foam",
            "Air cushions",
            "Thermocol where appropriate",
            "Corrugated separators",
            "Edge protection",
            "Strong outer cartons"
          ]
        },
        {
          "t": "p",
          "text": "The words FRAGILE / HANDLE WITH CARE should be displayed where appropriate."
        },
        {
          "t": "p",
          "text": "However, a fragile label does not replace proper protective packaging."
        }
      ]
    },
    {
      "n": 10,
      "title": "MULTI-PACKAGE SHIPMENTS",
      "blocks": [
        {
          "t": "p",
          "text": "Multiple cartons or bags belonging to one order should not simply be taped together unless the selected courier/service explicitly permits it."
        },
        {
          "t": "p",
          "text": "Where available, merchants should use:"
        },
        {
          "t": "ul",
          "items": [
            "Multi-package shipment functionality, or",
            "Separate AWBs for separate packages."
          ]
        },
        {
          "t": "p",
          "text": "Separate AWBs for separate packages."
        },
        {
          "t": "p",
          "text": "Every package must carry the correct AWB/label."
        },
        {
          "t": "p",
          "text": "Nexgo/courier partners may not accept claims for packages that are improperly combined, incorrectly labelled or shipped without the required AWB identification."
        }
      ]
    },
    {
      "n": 11,
      "title": "SPECIAL HANDLING LABELS",
      "blocks": [
        {
          "t": "p",
          "text": "Where applicable, merchants should use suitable handling markings such as:"
        },
        {
          "t": "ul",
          "items": [
            "FRAGILE",
            "THIS SIDE UP",
            "KEEP DRY",
            "HANDLE WITH CARE",
            "LIQUID",
            "DO NOT STACK",
            "OTHER applicable handling instructions"
          ]
        },
        {
          "t": "p",
          "text": "Handling labels do not guarantee special treatment unless the selected courier service specifically supports such handling."
        }
      ]
    },
    {
      "n": 12,
      "title": "PROHIBITED & RESTRICTED ITEMS",
      "blocks": [
        {
          "t": "p",
          "text": "Merchants must not use Nexgo to ship products prohibited by applicable law or by the selected courier partner."
        },
        {
          "t": "p",
          "text": "Examples may include:"
        },
        {
          "t": "ul",
          "items": [
            "Illegal narcotics",
            "Explosives",
            "Firearms and ammunition",
            "Hazardous materials",
            "Flammable substances",
            "Certain chemicals",
            "Live animals",
            "Human remains",
            "Cash/currency",
            "Certain precious metals or stones",
            "Counterfeit goods",
            "Illegal or stolen goods",
            "Pornographic/indecent material where prohibited by law",
            "Dangerous weapons",
            "Certain batteries and battery-powered products",
            "Items prohibited under applicable aviation/transport regulations",
            "Any inadequately packaged or leaking shipment",
            "Any item prohibited by the selected courier partner"
          ]
        },
        {
          "t": "p",
          "text": "The prohibited-item list may vary by courier, service type and destination."
        },
        {
          "t": "p",
          "text": "Nexgo reserves the right to reject, suspend, return or otherwise handle shipments that violate applicable laws, carrier policies or Nexgo terms."
        }
      ]
    },
    {
      "n": 13,
      "title": "WEIGHT & DIMENSION SOP",
      "blocks": [
        {
          "t": "p",
          "text": "Shipping charges may be calculated using the applicable chargeable weight."
        },
        {
          "t": "p",
          "text": "Chargeable weight may be based on the higher of:"
        },
        {
          "t": "ul",
          "items": [
            "Dead Weight: actual physical weight of the shipment.",
            "Volumetric Weight: weight calculated from package dimensions."
          ]
        },
        {
          "t": "h",
          "text": "Volumetric Weight"
        },
        {
          "t": "p",
          "text": "A commonly used formula is:"
        },
        {
          "t": "p",
          "text": "Length × Breadth × Height ÷ Applicable Divisor"
        },
        {
          "t": "p",
          "text": "The applicable divisor may vary according to:"
        },
        {
          "t": "ul",
          "items": [
            "Courier partner",
            "Service type",
            "Air/surface movement",
            "Shipment category",
            "Commercial agreement"
          ]
        },
        {
          "t": "p",
          "text": "The merchant must enter accurate weight and dimensions while booking the shipment."
        }
      ]
    },
    {
      "n": 14,
      "title": "WEIGHT DISCREPANCY",
      "blocks": [
        {
          "t": "p",
          "text": "A weight discrepancy occurs when the courier-recorded weight differs from the weight declared by the merchant."
        },
        {
          "t": "p",
          "text": "Nexgo acts as a technology/aggregation platform and the final physical weight may be captured by the carrier."
        },
        {
          "t": "p",
          "text": "If a discrepancy is raised, the merchant may be required to provide evidence such as:"
        },
        {
          "t": "ul",
          "items": [
            "Package photographs",
            "Photograph of package on weighing scale",
            "Measurement photographs",
            "Original package dimensions",
            "Product/package video",
            "Invoice",
            "Other supporting evidence requested by Nexgo"
          ]
        },
        {
          "t": "h",
          "text": "Dispute Timeline"
        },
        {
          "t": "p",
          "text": "Weight disputes must be raised within the applicable dispute window communicated by Nexgo/courier."
        },
        {
          "t": "p",
          "text": "If the merchant does not raise a dispute within the applicable period, the courier-recorded weight may be treated as accepted."
        }
      ]
    },
    {
      "n": 15,
      "title": "SHIPMENT DAMAGE",
      "blocks": [
        {
          "t": "p",
          "text": "If a shipment arrives damaged, the merchant/consignee should report the issue as soon as possible."
        },
        {
          "t": "p",
          "text": "Evidence may include:"
        },
        {
          "t": "ul",
          "items": [
            "Outer packaging photographs",
            "Inner packaging photographs",
            "Product photographs",
            "Unboxing video",
            "Invoice",
            "AWB",
            "Damage description",
            "Packaging condition photographs"
          ]
        },
        {
          "t": "p",
          "text": "Claims are subject to the selected courier partner's claim policy and Nexgo's applicable terms."
        },
        {
          "t": "p",
          "text": "Poor, insufficient or tampered packaging may result in claim rejection."
        }
      ]
    },
    {
      "n": 16,
      "title": "LOST SHIPMENT",
      "blocks": [
        {
          "t": "p",
          "text": "A shipment may be treated as lost/untraceable after the applicable investigation and carrier-defined TAT."
        },
        {
          "t": "p",
          "text": "The investigation may require:"
        },
        {
          "t": "ul",
          "items": [
            "AWB number",
            "Invoice",
            "Product value",
            "Product description",
            "Packaging photographs",
            "KYC information",
            "Other documents required by the courier partner"
          ]
        },
        {
          "t": "p",
          "text": "Claim settlement, if approved, will be subject to the applicable carrier agreement, service type, declared value, insurance/risk coverage and claim limits."
        },
        {
          "t": "p",
          "text": "Nexgo does not guarantee reimbursement of the full invoice value unless the applicable service/claim policy specifically provides for it."
        }
      ]
    },
    {
      "n": 17,
      "title": "CLAIM PROCESS",
      "blocks": [
        {
          "t": "p",
          "text": "Claims should be raised through the Nexgo support system/panel within the applicable claim period."
        },
        {
          "t": "h",
          "text": "Claim Types"
        },
        {
          "t": "ul",
          "items": [
            "Lost shipment",
            "Damage",
            "Shortage",
            "Missing item",
            "Delivery dispute",
            "POD dispute",
            "Other carrier-related shipment issues"
          ]
        },
        {
          "t": "h",
          "text": "Required Information"
        },
        {
          "t": "p",
          "text": "The merchant may be required to provide:"
        },
        {
          "t": "ul",
          "items": [
            "AWB number",
            "Invoice",
            "Product details",
            "Shipment value",
            "Packaging proof",
            "Photos/videos",
            "KYC information",
            "Any other supporting documents"
          ]
        },
        {
          "t": "p",
          "text": "Nexgo may forward the claim to the concerned courier partner for investigation."
        },
        {
          "t": "p",
          "text": "Final approval and settlement are subject to the applicable courier policy."
        }
      ]
    },
    {
      "n": 18,
      "title": "PROOF OF DELIVERY – POD",
      "blocks": [
        {
          "t": "p",
          "text": "POD may be requested for eligible shipments after delivery."
        },
        {
          "t": "p",
          "text": "Depending on the courier partner, POD may contain:"
        },
        {
          "t": "ul",
          "items": [
            "Recipient name",
            "Delivery date/time",
            "Delivery status",
            "Signature",
            "OTP verification",
            "Delivery photograph",
            "Digital delivery confirmation"
          ]
        },
        {
          "t": "p",
          "text": "POD availability and retrieval time may vary by courier partner."
        }
      ]
    },
    {
      "n": 19,
      "title": "IN-TRANSIT SHIPMENTS",
      "blocks": [
        {
          "t": "p",
          "text": "Transit time depends on:"
        },
        {
          "t": "ul",
          "items": [
            "Origin",
            "Destination",
            "Courier partner",
            "Service type",
            "Shipment weight",
            "Weather",
            "Operational conditions",
            "Holidays",
            "Natural events",
            "Regulatory restrictions",
            "Network disruptions"
          ]
        },
        {
          "t": "p",
          "text": "The estimated delivery date shown on the Nexgo platform should be considered an estimated TAT and not an unconditional guarantee unless expressly stated otherwise."
        }
      ]
    },
    {
      "n": 20,
      "title": "ODA / NON-SERVICEABLE LOCATIONS",
      "blocks": [
        {
          "t": "h",
          "text": "ODA – Out of Delivery Area"
        },
        {
          "t": "p",
          "text": "An ODA location is an area where normal courier delivery may require special handling, additional charges or alternate arrangements."
        },
        {
          "t": "p",
          "text": "Possible outcomes include:"
        },
        {
          "t": "ul",
          "items": [
            "Additional ODA charges",
            "Delayed delivery",
            "Branch delivery",
            "Customer self-collection",
            "Alternate delivery arrangement"
          ]
        },
        {
          "t": "h",
          "text": "NSZ – Non-Serviceable Zone"
        },
        {
          "t": "p",
          "text": "A Non-Serviceable Zone is a location where the selected courier partner does not provide regular pickup or delivery service."
        },
        {
          "t": "p",
          "text": "Serviceability can change based on courier network conditions."
        }
      ]
    },
    {
      "n": 21,
      "title": "EXTRA DELIVERY ATTEMPTS",
      "blocks": [
        {
          "t": "p",
          "text": "If additional delivery attempts are required beyond the courier's standard attempt policy, additional charges may be applicable."
        },
        {
          "t": "p",
          "text": "Such charges will depend on:"
        },
        {
          "t": "ul",
          "items": [
            "Courier partner",
            "Shipment type",
            "Weight slab",
            "Destination",
            "Number of additional attempts",
            "Applicable commercial agreement"
          ]
        },
        {
          "t": "p",
          "text": "Any applicable charges may be debited from the merchant's Nexgo wallet or account."
        }
      ]
    },
    {
      "n": 22,
      "title": "COD REMITTANCE",
      "blocks": [
        {
          "t": "p",
          "text": "For eligible COD shipments, the courier collects the payment from the consignee."
        },
        {
          "t": "p",
          "text": "After successful delivery and collection, the COD amount is processed for settlement according to Nexgo's applicable remittance cycle."
        },
        {
          "t": "h",
          "text": "COD Conditions"
        },
        {
          "t": "ul",
          "items": [
            "Merchant KYC must be completed.",
            "Correct bank details must be provided.",
            "Bank account should belong to the verified merchant/business where required.",
            "Negative wallet balances or outstanding dues may affect settlement.",
            "Fraud/suspicious activity may result in a temporary settlement hold.",
            "Banking errors caused by incorrect merchant-provided details are the merchant's responsibility.",
            "The exact COD cycle will be communicated through the Nexgo platform or applicable commercial agreement."
          ]
        }
      ]
    },
    {
      "n": 23,
      "title": "COD HOLD",
      "blocks": [
        {
          "t": "p",
          "text": "COD remittance may be temporarily held in circumstances including:"
        },
        {
          "t": "ul",
          "items": [
            "Incomplete KYC",
            "KYC mismatch",
            "Incorrect bank details",
            "Negative wallet balance",
            "Outstanding dues",
            "Fraud investigation",
            "Regulatory requirement",
            "Disputed transactions",
            "Other risk/compliance concerns"
          ]
        },
        {
          "t": "p",
          "text": "Once the relevant issue is resolved, eligible funds may be released according to the applicable settlement process."
        }
      ]
    },
    {
      "n": 24,
      "title": "WALLET & BILLING",
      "blocks": [
        {
          "t": "p",
          "text": "Merchants are responsible for maintaining sufficient balance where prepaid shipping/wallet services are applicable."
        },
        {
          "t": "p",
          "text": "Charges may include:"
        },
        {
          "t": "ul",
          "items": [
            "Forward shipping",
            "RTO shipping",
            "COD charges",
            "Additional handling",
            "ODA charges",
            "Weight discrepancy charges",
            "Additional delivery attempt charges",
            "Cancellation charges",
            "Other applicable carrier charges"
          ]
        },
        {
          "t": "p",
          "text": "Nexgo may debit applicable charges from the merchant wallet/account."
        },
        {
          "t": "p",
          "text": "Carrier billing adjustments may be reflected after the shipment has been processed."
        }
      ]
    },
    {
      "n": 25,
      "title": "SHIPMENT CANCELLATION",
      "blocks": [
        {
          "t": "p",
          "text": "A shipment may be cancelled before pickup subject to the applicable courier and Nexgo rules."
        },
        {
          "t": "p",
          "text": "Cancellation after pickup or after movement into the courier network may be treated differently and may result in shipping/RTO/handling charges."
        },
        {
          "t": "p",
          "text": "Any refund will be processed according to:"
        },
        {
          "t": "ul",
          "items": [
            "Shipment status",
            "Courier billing status",
            "Applicable Nexgo refund policy",
            "Carrier confirmation",
            "Outstanding dues or adjustments"
          ]
        }
      ]
    },
    {
      "n": 26,
      "title": "RTO RECEIVING SOP",
      "blocks": [
        {
          "t": "p",
          "text": "Merchants must ensure that their registered pickup/return address remains active and serviceable for receiving RTO shipments."
        },
        {
          "t": "p",
          "text": "If an RTO cannot be delivered to the merchant because of:"
        },
        {
          "t": "ul",
          "items": [
            "Incorrect return address",
            "Closed premises",
            "Refusal",
            "Non-availability",
            "Non-serviceable location",
            "Other merchant-related reason"
          ]
        },
        {
          "t": "p",
          "text": "additional handling or reattempt charges may apply."
        }
      ]
    },
    {
      "n": 27,
      "title": "CUSTOMER SUPPORT & ESCALATION",
      "blocks": [
        {
          "t": "p",
          "text": "For any shipment issue, merchants should first raise a ticket through the Nexgo panel/support channel."
        },
        {
          "t": "p",
          "text": "The merchant should provide:"
        },
        {
          "t": "ul",
          "items": [
            "AWB number",
            "Registered mobile/email",
            "Issue category",
            "Shipment details",
            "Supporting documents/photos"
          ]
        },
        {
          "t": "h",
          "text": "Suggested Escalation Levels"
        },
        {
          "t": "table",
          "head": [
            "Level",
            "Team",
            "Handles"
          ],
          "rows": [
            [
              "1",
              "Customer Support",
              "General shipment, pickup and tracking issues."
            ],
            [
              "2",
              "Operations Team",
              "Pickup failures, transit exceptions, delivery issues and courier escalations."
            ],
            [
              "3",
              "Claims / Finance Team",
              "Damage, lost shipment, billing, COD and claim-related matters."
            ],
            [
              "4",
              "Management Escalation",
              "Unresolved critical cases after completion of the applicable escalation process."
            ]
          ]
        }
      ]
    },
    {
      "n": 28,
      "title": "FRAUD & MISUSE",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo maintains a zero-tolerance approach toward fraudulent shipping activity."
        },
        {
          "t": "p",
          "text": "Examples include:"
        },
        {
          "t": "ul",
          "items": [
            "Fake orders",
            "Fake COD bookings",
            "Incorrect product declarations",
            "Misdeclaration of shipment value",
            "Prohibited products",
            "Manipulation of shipment information",
            "Fraudulent claims",
            "Multiple accounts created to avoid outstanding dues",
            "Abuse of promotional pricing",
            "False weight/dimension declarations"
          ]
        },
        {
          "t": "p",
          "text": "Nexgo may suspend or terminate accounts and may take further action where required."
        }
      ]
    },
    {
      "n": 29,
      "title": "ACCOUNT SUSPENSION",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may restrict or suspend an account in circumstances including:"
        },
        {
          "t": "ul",
          "items": [
            "Non-payment of dues",
            "Fraudulent activity",
            "Prohibited products",
            "Repeated policy violations",
            "Invalid KYC",
            "Regulatory concerns",
            "Abuse of the platform",
            "Excessive disputes or suspicious activity",
            "Violation of Nexgo's Terms & Conditions"
          ]
        },
        {
          "t": "p",
          "text": "Shipments may be placed on hold where necessary for operational, financial, security or compliance reasons."
        }
      ]
    },
    {
      "n": 30,
      "title": "MERCHANT RESPONSIBILITIES",
      "blocks": [
        {
          "t": "p",
          "text": "The merchant is responsible for:"
        },
        {
          "t": "ul",
          "items": [
            "Accurate shipment information",
            "Correct customer address",
            "Correct mobile number",
            "Correct weight and dimensions",
            "Correct product declaration",
            "Proper packaging",
            "Valid invoice/documentation",
            "Applicable GST/e-way bill compliance",
            "Compliance with prohibited-item rules",
            "Correct bank information",
            "Timely dispute submission",
            "Maintaining sufficient wallet balance"
          ]
        }
      ]
    },
    {
      "n": 31,
      "title": "COURIER PARTNER RESPONSIBILITIES",
      "blocks": [
        {
          "t": "p",
          "text": "The selected courier partner is responsible for operational execution of the shipment within its applicable service terms, including:"
        },
        {
          "t": "ul",
          "items": [
            "Pickup",
            "Sorting",
            "Transportation",
            "Last-mile delivery",
            "Delivery attempts",
            "RTO movement",
            "Applicable POD",
            "Carrier-side shipment investigation"
          ]
        },
        {
          "t": "p",
          "text": "Nexgo provides the aggregation technology and facilitates communication/escalation with courier partners."
        }
      ]
    },
    {
      "n": 32,
      "title": "SERVICE TAT",
      "blocks": [
        {
          "t": "p",
          "text": "TAT may vary depending on the shipment and courier partner."
        },
        {
          "t": "p",
          "text": "Typical operational stages include:"
        },
        {
          "t": "ul",
          "items": [
            "Pickup → Origin Processing → Transit → Destination Processing → Out for Delivery → Delivered/RTO",
            "TAT can be affected by:",
            "Sundays/public holidays",
            "Weather",
            "Natural disasters",
            "Strikes",
            "Network congestion",
            "Political/regulatory restrictions",
            "Incorrect address",
            "Customer availability",
            "ODA/NSZ locations",
            "Operational disruptions"
          ]
        },
        {
          "t": "p",
          "text": "Any TAT displayed on Nexgo should be treated according to the service selected and applicable courier conditions."
        }
      ]
    },
    {
      "n": 33,
      "title": "IMPORTANT PACKAGING CHECKLIST",
      "blocks": [
        {
          "t": "p",
          "text": "Before handing over every package:"
        },
        {
          "t": "ul",
          "items": [
            "Product is packed securely.",
            "Correct box/bag is used.",
            "Empty space is properly filled.",
            "Package is properly sealed.",
            "Product cannot move freely inside the package.",
            "Liquid products are leak-proof.",
            "Fragile products have sufficient cushioning.",
            "Shipping label is clearly visible.",
            "Old labels are removed/covered.",
            "Invoice/documents are included where required.",
            "AWB matches the shipment.",
            "Weight and dimensions are correctly entered.",
            "Applicable special handling markings are present."
          ]
        }
      ]
    },
    {
      "n": 34,
      "title": "IMPORTANT DISCLAIMER",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo is a courier aggregation and logistics technology platform. Shipment transportation and last-mile execution are performed through third-party courier/logistics partners."
        },
        {
          "t": "p",
          "text": "Courier-specific rates, serviceability, TAT, weight rules, COD rules, RTO charges, ODA charges, claim limits, prohibited-item rules, packaging requirements and additional attempt charges may vary and can be updated from time to time."
        },
        {
          "t": "p",
          "text": "Where a courier partner's operational policy differs from this general SOP, the applicable service-specific/courier-specific terms may apply."
        },
        {
          "t": "p",
          "text": "Nexgo reserves the right to modify this SOP, pricing, operational procedures and service conditions from time to time."
        }
      ]
    },
    {
      "n": 35,
      "title": "NEXGO SUPPORT",
      "blocks": [
        {
          "t": "p",
          "text": "For shipment-related assistance, merchants should use the support/contact options available inside the Nexgo dashboard."
        }
      ]
    }
  ]
};
