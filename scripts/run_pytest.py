"""
run_tests.py — Execution Harness for Python Integration & Unit Test Suite
"""

import sys
import unittest
from pathlib import Path

# Force UTF-8 output encoding for Windows terminal compatibility
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = Path(__file__).parent.parent.resolve()
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

def run_all_tests():
    print("=" * 70)
    print("  MediFlow Python System & Unit Test Verification Harness")
    print("=" * 70)

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    tests_dir = ROOT_DIR / "tests" / "unit"
    for file in tests_dir.glob("test_*.py"):
        module_name = f"tests.unit.{file.stem}"
        try:
            mod = __import__(module_name, fromlist=["*"])
            for name in dir(mod):
                if name.startswith("test_"):
                    func = getattr(mod, name)
                    if callable(func):
                        # Create unique test case instance
                        test_case_class = type(
                            f"TestCase_{file.stem}_{name}",
                            (unittest.TestCase,),
                            {name: lambda self, f=func: f()}
                        )
                        suite.addTest(test_case_class(name))
        except Exception as e:
            print(f"Error loading {file.name}: {e}")

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    if result.wasSuccessful() and result.testsRun > 0:
        print(f"\n[SUCCESS] ALL {result.testsRun} PYTHON UNIT TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n[FAIL] TEST RUN FAILED OR NO TESTS RAN ({result.testsRun} tests ran).")
        sys.exit(1)

if __name__ == "__main__":
    run_all_tests()

