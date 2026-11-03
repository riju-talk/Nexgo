// Source: "Refund & Cancellation Policy" supplied by the client (Word document). Edit the text here; the page renders it as is.
// Text in [SQUARE BRACKETS] is a blank the client still has to fill in (see lib/legal/company.js).
export const refund = {
  "title": "Refund & Cancellation Policy",
  "effective": "15 August 2026",
  "updated": "15 August 2026",
  "intro": [
    {
      "t": "p",
      "text": "This Refund & Cancellation Policy (“Policy”) explains the rules applicable to shipment cancellations, refunds, wallet credits, failed shipments, duplicate payments and other related transactions on the Nexgo platform."
    },
    {
      "t": "p",
      "text": "This Policy applies to merchants, businesses and other users purchasing or using logistics services through Nexgo (“Nexgo”, “we”, “us”, “our”)."
    },
    {
      "t": "p",
      "text": "This Policy should be read together with the Nexgo Terms of Service, Privacy Policy, Shipping SOP, Claims Policy, and applicable commercial/rate-card terms."
    }
  ],
  "sections": [
    {
      "n": 1,
      "title": "Scope",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo provides logistics aggregation services through which users may access services offered by different Courier Partners."
        },
        {
          "t": "p",
          "text": "Depending on the service, charges may include:"
        },
        {
          "t": "ul",
          "items": [
            "Shipping charges",
            "Forward shipping charges",
            "Reverse shipping charges",
            "COD charges",
            "Additional handling charges",
            "Weight discrepancy charges",
            "RTO charges",
            "NDR-related charges",
            "Packaging charges",
            "Other applicable logistics or service fees"
          ]
        },
        {
          "t": "p",
          "text": "Refund eligibility may vary depending on the specific service and shipment status."
        }
      ]
    },
    {
      "n": 2,
      "title": "Shipment Cancellation",
      "blocks": [
        {
          "t": "p",
          "text": "A shipment may generally be cancelled through the Nexgo dashboard or API before the shipment reaches a stage where cancellation is no longer technically or operationally possible."
        },
        {
          "t": "p",
          "text": "Cancellation may be available when:"
        },
        {
          "t": "ul",
          "items": [
            "Shipment has been created but not manifested",
            "Shipment has not been picked up",
            "Courier Partner permits cancellation",
            "AWB has not entered an irreversible operational stage",
            "Cancellation may not be available when:",
            "Shipment has already been picked up",
            "Shipment is in transit",
            "Shipment has reached the destination hub",
            "Shipment is out for delivery",
            "Shipment has already been delivered",
            "Shipment has entered RTO processing",
            "Courier Partner does not permit cancellation"
          ]
        },
        {
          "t": "p",
          "text": "The actual cancellation status shown on the Nexgo Platform will be considered the applicable status for that shipment."
        }
      ]
    },
    {
      "n": 3,
      "title": "Cancellation Before Pickup",
      "blocks": [
        {
          "t": "p",
          "text": "If an eligible shipment is cancelled before pickup, Nexgo may reverse or credit eligible prepaid shipping charges."
        },
        {
          "t": "p",
          "text": "However, certain charges may remain non-refundable where they have already been incurred."
        },
        {
          "t": "p",
          "text": "These may include:"
        },
        {
          "t": "ul",
          "items": [
            "Processing charges",
            "Payment gateway charges",
            "Special service charges",
            "Packaging charges",
            "Other third-party charges"
          ]
        },
        {
          "t": "p",
          "text": "Any applicable deduction will be displayed or communicated where reasonably practicable."
        }
      ]
    },
    {
      "n": 4,
      "title": "Cancellation After Pickup",
      "blocks": [
        {
          "t": "p",
          "text": "Once a shipment has been picked up, cancellation generally cannot be treated as a normal cancellation."
        },
        {
          "t": "p",
          "text": "The shipment may instead need to proceed through:"
        },
        {
          "t": "ul",
          "items": [
            "Delivery",
            "NDR",
            "RTO",
            "Reverse shipment",
            "Another operational process"
          ]
        },
        {
          "t": "p",
          "text": "Applicable shipping and logistics charges may therefore remain payable."
        }
      ]
    },
    {
      "n": 5,
      "title": "RTO and Cancellation",
      "blocks": [
        {
          "t": "p",
          "text": "Cancellation of an order does not automatically eliminate RTO-related charges."
        },
        {
          "t": "p",
          "text": "If a shipment has already entered RTO processing, the applicable:"
        },
        {
          "t": "ul",
          "items": [
            "Forward shipping charges",
            "RTO charges",
            "Handling charges",
            "Other applicable charges"
          ]
        },
        {
          "t": "p",
          "text": "may remain payable according to the applicable Courier Partner rate card."
        }
      ]
    },
    {
      "n": 6,
      "title": "Refund for Failed Shipment Creation",
      "blocks": [
        {
          "t": "p",
          "text": "If payment has been successfully deducted but Nexgo is unable to create the shipment because of a technical issue, the amount may be:"
        },
        {
          "t": "ul",
          "items": [
            "Automatically reversed,",
            "Credited to the Nexgo wallet, or",
            "Refunded to the original payment method,"
          ]
        },
        {
          "t": "p",
          "text": "depending on the payment method and transaction status."
        }
      ]
    },
    {
      "n": 7,
      "title": "Duplicate Payments",
      "blocks": [
        {
          "t": "p",
          "text": "If you accidentally make the same payment more than once for the same transaction, please contact Nexgo Support."
        },
        {
          "t": "p",
          "text": "After verification, Nexgo may:"
        },
        {
          "t": "ul",
          "items": [
            "Adjust the excess amount against your Nexgo wallet,",
            "Adjust it against future invoices, or"
          ]
        },
        {
          "t": "p",
          "text": "Process a refund where applicable."
        },
        {
          "t": "p",
          "text": "You may be required to provide:"
        },
        {
          "t": "ul",
          "items": [
            "Transaction ID",
            "Payment reference",
            "Account information",
            "Proof of payment"
          ]
        }
      ]
    },
    {
      "n": 8,
      "title": "Failed or Pending Payments",
      "blocks": [
        {
          "t": "p",
          "text": "A payment may sometimes show as Pending → Failed → Successful due to delays between payment systems."
        },
        {
          "t": "p",
          "text": "Users should avoid making repeated payments while a transaction is still showing as pending unless instructed by Nexgo."
        },
        {
          "t": "p",
          "text": "If an amount is deducted but the Nexgo account is not credited, Nexgo may verify the transaction with the relevant payment provider."
        }
      ]
    },
    {
      "n": 9,
      "title": "Wallet Refunds",
      "blocks": [
        {
          "t": "p",
          "text": "Where Nexgo determines that a refund should be credited to the Nexgo wallet, the amount may be added to the user's wallet balance."
        },
        {
          "t": "p",
          "text": "Wallet credits may be used for eligible Nexgo services."
        },
        {
          "t": "p",
          "text": "Wallet balances may be subject to:"
        },
        {
          "t": "ul",
          "items": [
            "Account verification",
            "KYC requirements",
            "Fraud checks",
            "Applicable commercial terms"
          ]
        }
      ]
    },
    {
      "n": 10,
      "title": "Refund to Original Payment Method",
      "blocks": [
        {
          "t": "p",
          "text": "Where a refund is approved for the original payment method, Nexgo may initiate the refund through the applicable payment provider."
        },
        {
          "t": "p",
          "text": "The actual time taken for the refund to appear in the user's bank account, card or payment account may depend on:"
        },
        {
          "t": "ul",
          "items": [
            "Payment gateway",
            "Bank",
            "Card network",
            "UPI provider",
            "Other financial institution"
          ]
        },
        {
          "t": "p",
          "text": "Nexgo cannot guarantee the processing time of third-party financial institutions."
        }
      ]
    },
    {
      "n": 11,
      "title": "Shipping Charge Refunds",
      "blocks": [
        {
          "t": "p",
          "text": "Shipping charges are generally paid for logistics services provided or initiated through Nexgo."
        },
        {
          "t": "p",
          "text": "A shipping charge may be refundable where:"
        },
        {
          "t": "ul",
          "items": [
            "A shipment was never successfully created despite payment",
            "A duplicate charge occurred",
            "Nexgo incorrectly charged an amount",
            "A refund is specifically approved by Nexgo",
            "A Courier Partner charge is reversed",
            "Another refund condition expressly applies"
          ]
        },
        {
          "t": "p",
          "text": "Shipping charges may not be refundable where the logistics service has already been performed or costs have already been incurred."
        }
      ]
    },
    {
      "n": 12,
      "title": "Weight Discrepancy Charges",
      "blocks": [
        {
          "t": "p",
          "text": "If the actual shipment weight or dimensions differ from the information declared by the merchant, the Courier Partner may apply additional charges."
        },
        {
          "t": "p",
          "text": "Such charges are generally not refundable merely because the merchant disputes the measurement."
        },
        {
          "t": "p",
          "text": "If you believe a weight or dimension charge is incorrect, you may raise a dispute through the applicable Weight Dispute / Billing Dispute process."
        },
        {
          "t": "p",
          "text": "Supporting evidence may be requested."
        }
      ]
    },
    {
      "n": 13,
      "title": "RTO Charges",
      "blocks": [
        {
          "t": "p",
          "text": "RTO charges are generally not refundable where the shipment has actually entered or completed the RTO process."
        },
        {
          "t": "p",
          "text": "RTO may occur due to reasons including:"
        },
        {
          "t": "ul",
          "items": [
            "Customer refusal",
            "Incorrect address",
            "Customer unavailable",
            "Delivery failure",
            "COD refusal",
            "Multiple unsuccessful delivery attempts",
            "Other delivery-related circumstances"
          ]
        },
        {
          "t": "p",
          "text": "Applicable charges depend on the Courier Partner and service selected."
        }
      ]
    },
    {
      "n": 14,
      "title": "COD Charges",
      "blocks": [
        {
          "t": "p",
          "text": "COD charges generally relate to the collection and processing of COD payments."
        },
        {
          "t": "p",
          "text": "If a COD shipment is successfully delivered, applicable COD charges may remain payable."
        },
        {
          "t": "p",
          "text": "COD charges may not be refundable simply because:"
        },
        {
          "t": "ul",
          "items": [
            "The customer later requests cancellation",
            "The customer returns the product",
            "The shipment enters RTO"
          ]
        },
        {
          "t": "p",
          "text": "unless Nexgo's applicable commercial terms provide otherwise."
        }
      ]
    },
    {
      "n": 15,
      "title": "NDR Shipments",
      "blocks": [
        {
          "t": "p",
          "text": "NDR-related charges, where applicable, may be non-refundable once the relevant service or operational activity has been performed."
        },
        {
          "t": "p",
          "text": "Nexgo may provide tools to:"
        },
        {
          "t": "ul",
          "items": [
            "Contact customers",
            "Request reattempts",
            "Update instructions",
            "Manage NDR"
          ]
        },
        {
          "t": "p",
          "text": "The availability of these services does not guarantee successful delivery."
        }
      ]
    },
    {
      "n": 16,
      "title": "Reverse Shipments",
      "blocks": [
        {
          "t": "p",
          "text": "Reverse shipment charges are generally treated as separate logistics charges."
        },
        {
          "t": "p",
          "text": "If a reverse shipment has already been picked up or processed, the applicable charges may not be refundable."
        },
        {
          "t": "p",
          "text": "If a reverse shipment is cancelled before processing begins, eligible charges may be reversed depending on the Courier Partner and service conditions."
        }
      ]
    },
    {
      "n": 17,
      "title": "Courier Partner Failure",
      "blocks": [
        {
          "t": "p",
          "text": "If a Courier Partner fails to provide a service, Nexgo may investigate the issue."
        },
        {
          "t": "p",
          "text": "Depending on the circumstances, Nexgo may:"
        },
        {
          "t": "ul",
          "items": [
            "Raise the issue with the Courier Partner",
            "Provide a service adjustment",
            "Issue an eligible credit",
            "Process a refund",
            "Offer an alternative resolution"
          ]
        },
        {
          "t": "p",
          "text": "Refunds are not automatic solely because a delivery takes longer than the estimated delivery period."
        }
      ]
    },
    {
      "n": 18,
      "title": "Delivery Delays",
      "blocks": [
        {
          "t": "p",
          "text": "Estimated delivery timelines are generally estimates and may be affected by:"
        },
        {
          "t": "ul",
          "items": [
            "Weather",
            "Traffic",
            "Natural disasters",
            "Operational disruptions",
            "Public holidays",
            "Remote locations",
            "Customer availability",
            "Incorrect address",
            "Courier Partner delays",
            "Regulatory restrictions",
            "Other circumstances outside Nexgo's reasonable control"
          ]
        },
        {
          "t": "p",
          "text": "A delivery delay does not automatically create a right to a refund."
        }
      ]
    },
    {
      "n": 19,
      "title": "Lost or Damaged Shipments",
      "blocks": [
        {
          "t": "p",
          "text": "Refunds for lost or damaged shipments are handled under the applicable Nexgo Claims Policy."
        },
        {
          "t": "p",
          "text": "Depending on the circumstances, a claim may require:"
        },
        {
          "t": "ul",
          "items": [
            "Shipment information",
            "Invoice",
            "Product details",
            "Proof of value",
            "Packaging information",
            "Images/videos",
            "Delivery information",
            "Other supporting documents"
          ]
        },
        {
          "t": "p",
          "text": "Approval of a claim does not automatically mean that the entire shipment value will be refunded."
        }
      ]
    },
    {
      "n": 20,
      "title": "Incorrect or Unauthorized Charges",
      "blocks": [
        {
          "t": "p",
          "text": "If you believe that Nexgo has charged you incorrectly, you should contact Nexgo Support as soon as possible."
        },
        {
          "t": "p",
          "text": "Please provide:"
        },
        {
          "t": "ul",
          "items": [
            "Shipment/AWB number",
            "Invoice number",
            "Transaction ID",
            "Date of transaction",
            "Amount charged",
            "Reason for dispute",
            "Supporting documents"
          ]
        },
        {
          "t": "p",
          "text": "Nexgo may investigate the transaction and, where appropriate, issue an adjustment or refund."
        }
      ]
    },
    {
      "n": 21,
      "title": "Promotional Credits",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may occasionally provide:"
        },
        {
          "t": "ul",
          "items": [
            "Promotional credits",
            "Coupons",
            "Shipping credits",
            "Cashback",
            "Referral credits",
            "Promotional wallet balances",
            "Unless expressly stated otherwise, promotional credits:",
            "Are not cash",
            "Are non-transferable",
            "Cannot be withdrawn",
            "May have an expiry date",
            "May be subject to eligibility requirements"
          ]
        },
        {
          "t": "p",
          "text": "Promotional credits may not be refundable."
        }
      ]
    },
    {
      "n": 22,
      "title": "Taxes and GST",
      "blocks": [
        {
          "t": "p",
          "text": "Where applicable, refunds and adjustments will be processed subject to applicable tax and GST requirements."
        },
        {
          "t": "p",
          "text": "If a tax invoice has already been issued, the appropriate credit note or adjustment mechanism may be used where required."
        }
      ]
    },
    {
      "n": 23,
      "title": "Refund Processing Time",
      "blocks": [
        {
          "t": "p",
          "text": "Once a refund is approved, Nexgo will generally initiate the refund within a reasonable processing period."
        },
        {
          "t": "p",
          "text": "The actual time for funds to reach the user's account may depend on the relevant payment provider or bank."
        },
        {
          "t": "p",
          "text": "Typical processing may vary depending on:"
        },
        {
          "t": "table",
          "head": [
            "Payment method",
            "Processing"
          ],
          "rows": [
            [
              "UPI",
              "Subject to payment provider"
            ],
            [
              "Debit/Credit Card",
              "Subject to bank/card network"
            ],
            [
              "Net Banking",
              "Subject to bank"
            ],
            [
              "Wallet",
              "Subject to Nexgo processing"
            ],
            [
              "Other methods",
              "According to applicable provider"
            ]
          ]
        },
        {
          "t": "p",
          "text": "The displayed processing timeline should be treated as an estimate rather than a guarantee."
        }
      ]
    },
    {
      "n": 24,
      "title": "How to Request a Refund",
      "blocks": [
        {
          "t": "p",
          "text": "To request a refund or billing adjustment:"
        },
        {
          "t": "ol",
          "items": [
            "Log in to your Nexgo Dashboard.",
            "Go to Support → Billing & Payments.",
            "Select Raise a Refund / Billing Dispute.",
            "Provide the shipment/AWB number, transaction ID, invoice number, amount, reason and supporting documents.",
            "Submit the request."
          ]
        },
        {
          "t": "p",
          "text": "Nexgo may review the request and contact you for additional information."
        }
      ]
    },
    {
      "n": 25,
      "title": "Refund Review",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may review:"
        },
        {
          "t": "ul",
          "items": [
            "Shipment status",
            "Courier Partner records",
            "Payment records",
            "API logs",
            "Tracking events",
            "Pickup records",
            "Delivery records",
            "Billing records",
            "Account history"
          ]
        },
        {
          "t": "p",
          "text": "Nexgo may request additional information before approving or rejecting a refund."
        }
      ]
    },
    {
      "n": 26,
      "title": "Fraudulent Refund Requests",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may reject or suspend refund requests where it reasonably believes that:"
        },
        {
          "t": "ul",
          "items": [
            "False information was provided",
            "Documents were manipulated",
            "The transaction is fraudulent",
            "The account is being abused",
            "Multiple duplicate claims are being submitted",
            "The refund process is being intentionally misused"
          ]
        },
        {
          "t": "p",
          "text": "Nexgo may also suspend the relevant account where necessary."
        }
      ]
    },
    {
      "n": 27,
      "title": "Cancellation Through API",
      "blocks": [
        {
          "t": "p",
          "text": "If you use the Nexgo API, cancellation must follow the applicable API documentation."
        },
        {
          "t": "p",
          "text": "A successful API cancellation request does not necessarily mean that a shipment has been cancelled."
        },
        {
          "t": "p",
          "text": "Merchants should verify the shipment status returned by Nexgo."
        },
        {
          "t": "p",
          "text": "For API integrations, merchants are responsible for handling:"
        },
        {
          "t": "ul",
          "items": [
            "Cancellation responses",
            "Errors",
            "Duplicate requests",
            "Webhook events",
            "Shipment status changes"
          ]
        }
      ]
    },
    {
      "n": 28,
      "title": "Cancellation Through Third-Party Integrations",
      "blocks": [
        {
          "t": "p",
          "text": "If a shipment is created through an ecommerce platform, marketplace, ERP or other integration, cancellation may depend on both:"
        },
        {
          "t": "ul",
          "items": [
            "Nexgo's system, and",
            "The third-party platform."
          ]
        },
        {
          "t": "p",
          "text": "A cancellation request submitted to one platform may not automatically cancel a shipment on another platform."
        },
        {
          "t": "p",
          "text": "Merchants should verify the final shipment status."
        }
      ]
    },
    {
      "n": 29,
      "title": "Non-Refundable Charges",
      "blocks": [
        {
          "t": "p",
          "text": "Unless otherwise agreed, the following may generally be non-refundable once incurred:"
        },
        {
          "t": "ul",
          "items": [
            "Completed shipping charges",
            "RTO charges",
            "Reverse pickup charges",
            "COD processing charges",
            "Weight discrepancy charges",
            "Additional handling charges",
            "Third-party payment charges",
            "Completed premium services",
            "Charges resulting from incorrect information supplied by the merchant",
            "Other third-party charges already incurred"
          ]
        }
      ]
    },
    {
      "n": 30,
      "title": "Exceptions",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may make exceptions to this Policy where:"
        },
        {
          "t": "ul",
          "items": [
            "Required by law",
            "Necessary to correct a Nexgo error",
            "Required due to a payment-system issue",
            "Approved by Nexgo management",
            "Required under a separate written agreement",
            "Necessary to resolve an exceptional technical or operational issue"
          ]
        },
        {
          "t": "p",
          "text": "An exception in one case does not create an obligation to provide the same exception in another case."
        }
      ]
    },
    {
      "n": 31,
      "title": "No Automatic Refund",
      "blocks": [
        {
          "t": "p",
          "text": "Submitting a cancellation or refund request does not guarantee approval."
        },
        {
          "t": "p",
          "text": "Each request may be evaluated according to:"
        },
        {
          "t": "ul",
          "items": [
            "Shipment status",
            "Applicable service terms",
            "Courier Partner rules",
            "Payment status",
            "Reason for cancellation",
            "Applicable commercial agreement",
            "Applicable law"
          ]
        }
      ]
    },
    {
      "n": 32,
      "title": "Changes to This Policy",
      "blocks": [
        {
          "t": "p",
          "text": "Nexgo may update this Refund & Cancellation Policy from time to time."
        },
        {
          "t": "p",
          "text": "Changes may be made due to:"
        },
        {
          "t": "ul",
          "items": [
            "New services",
            "Courier Partner requirements",
            "Payment-provider changes",
            "Operational changes",
            "Legal requirements",
            "Commercial policy changes"
          ]
        },
        {
          "t": "p",
          "text": "The latest version will be published on the Nexgo website."
        },
        {
          "t": "p",
          "text": "The “Last Updated” date will indicate the latest revision."
        }
      ]
    }
  ]
};
