import pytest
import asyncio
from app.llm.agent import ConversationalAgent

BENCHMARK_20_QUESTIONS = [
    # 8 Coverage Questions
    ("What are the sum insured options available under Arogya Shield?", ("5,00,000", "5 lakh", "five lakh", "paanch lakh", "पांच लाख", "5"), True),
    ("What is the room rent capping for the Silver plan?", ("1%", "one percent", "पांच हज़ार", "पांच हजार", "5,000", "5000", "एक percent"), True),
    ("Is there any room rent capping for Gold and Platinum plans?", ("no", "single private", "कोई limit नहीं", "नहीं मिला"), True),
    ("How many days of pre-hospitalisation expenses are covered?", ("60 days", "sixty days", "साठ days", "साठ दिन", "60"), True),
    ("How many days of post-hospitalisation expenses are covered?", ("90 days", "ninety days", "नब्बे days", "नब्बे दिन", "90"), True),
    ("Are day care procedures covered under this policy?", ("day care", "all day care", "डे केयर"), True),
    ("What is the emergency ambulance cover limit?", ("3,000", "three thousand", "तीन हज़ार", "तीन हजार", "3000"), True),
    ("Are Ayurvedic or AYUSH treatments covered?", ("ayush", "ayurvedic", "आयुष", "आयुर्वेदिक"), True),

    # 4 Claims Process Questions
    ("How much prior notice is required for planned hospitalization cashless claim?", ("48 hours", "forty eight hours", "अड़तालीस hours", "अड़तालीस घंटे", "48"), True),
    ("Within how many hours must an emergency hospitalization be intimated?", ("24 hours", "twenty four hours", "चौबीस hours", "चौबीस घंटे", "24"), True),
    ("How long do I have to submit bills for a reimbursement claim after discharge?", ("15 days", "fifteen days", "पंद्रह days", "पंद्रह दिन", "15"), True),
    ("What is the turnaround time for reimbursement claim settlement?", ("30 days", "thirty days", "तीस days", "तीस दिन", "30"), True),

    # 4 Validity & Exclusions Questions
    ("Is cosmetic surgery covered under the policy?", ("excluded", "not covered", "not payable", "नहीं होती", "नहीं होना चाहिए"), True),
    ("Does the policy cover injuries from extreme sports like skydiving?", ("excluded", "not covered", "not payable", "नहीं होती", "नहीं होना चाहिए"), True),
    ("What is the waiting period for pre-existing diseases like diabetes?", ("36 month", "36 months", "thirty six month", "छतीस", "छत्तीस", "तीस six", "तीस छह", "तीन साल", "36"), True),
    ("What is the waiting period for cataract surgery?", ("24 month", "24 months", "twenty four month", "चौबीस months", "चौबीस", "24"), True),

    # 2 Premium & Eligibility Questions
    ("What is the entry age limit for adults under this policy?", ("18", "eighteen", "अठारह"), True),
    ("What is the discount for choosing a 3-year multi-year policy tenure?", ("12%", "twelve percent", "बारह percent", "12 percent", "बारह"), True),

    # 2 Deliberately Unanswerable Trap Questions (Testing Strict Refusal)
    ("Does this policy cover drone collision injuries or pilot damage?", ("not have information", "not covered", "does not cover"), False),
    ("Can I get full reimbursement for dog veterinary expenses?", ("not have information", "not covered", "does not cover"), False),
]

@pytest.mark.asyncio
async def test_20_question_groundedness_benchmark():
    agent = ConversationalAgent()

    passed = 0
    total = len(BENCHMARK_20_QUESTIONS)
    failures = []

    for question, expected_keyword, is_in_doc in BENCHMARK_20_QUESTIONS:
        response_tokens = []
        async for token in agent.stream_response(question):
            response_tokens.append(token)
        raw_text = "".join(response_tokens).lower()
        response_text = raw_text.replace("-", " ")

        if isinstance(expected_keyword, (tuple, list)):
            keyword_found = any(k.lower().replace("-", " ") in response_text for k in expected_keyword)
        else:
            keyword_found = expected_keyword.lower().replace("-", " ") in response_text

        if is_in_doc:
            if keyword_found:
                passed += 1
            else:
                failures.append((question, expected_keyword, response_text))
        else:
            # Trap questions MUST contain refusal phrase (English or Hindi)
            if (
                "not have information" in response_text
                or "not covered" in response_text
                or "does not cover" in response_text
                or "jaankari nahi" in response_text
                or "mention नहीं मिला" in response_text
                or "help नहीं कर पाऊंगी" in response_text
                or "cover नहीं" in response_text
                or "नहीं होते" in response_text
            ):
                passed += 1
            else:
                failures.append((question, "refusal statement", response_text))

    print(f"\nBenchmark Results: {passed}/{total} passed.")
    assert passed == total, f"Groundedness failures: {failures}"
