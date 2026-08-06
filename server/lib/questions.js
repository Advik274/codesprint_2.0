// Zone capture problems — designed to take 2-5 minutes for a team of 3-5
// Each captured zone gets 5 options for the defending team to set as the trap
// Types: debugging, team_logic, cipher, output_trace, sql_logic

export const ZONE_PROBLEM_POOL = [

  // ── DEBUGGING (find & fix the bug) ───────────────────────────
  {
    id: 'z001', type: 'debugging', label: 'Debug: Infinite Loop',
    problem: `Find ALL bugs in this code and write the corrected version of the broken lines only.

\`\`\`python
def countdown(n):
    while n > 0:
        print(n)
        n + 1       # Line A
    print("Done!")

countdown(5)
\`\`\`

What should Line A be?`,
    answer: 'n -= 1',
    hint_type: 'Single line fix',
  },
  {
    id: 'z002', type: 'debugging', label: 'Debug: Wrong Output',
    problem: `This function should return the sum of all EVEN numbers from 1 to n (inclusive).
It has 2 bugs. Find and fix both.

\`\`\`python
def sum_evens(n):
    total = 0
    for i in range(1, n):    # Bug 1
        if i % 2 == 1:       # Bug 2
            total += i
    return total

print(sum_evens(10))  # Should print 30
\`\`\`

Write the 2 corrected lines (format: "line1fix | line2fix"):`,
    answer: 'range(1, n+1) | i % 2 == 0',
    hint_type: 'Two line fixes',
  },
  {
    id: 'z003', type: 'debugging', label: 'Debug: Off-By-One',
    problem: `This function should check if a string is a palindrome (reads same forwards and backwards).
Find the bug and write the fix.

\`\`\`python
def is_palindrome(s):
    s = s.lower()
    for i in range(len(s) // 2):
        if s[i] != s[len(s) - i]:    # Bug is here
            return False
    return True

print(is_palindrome("racecar"))  # Should print True
\`\`\`

Write the corrected expression for the right side of the comparison:`,
    answer: 's[len(s) - i - 1]',
    hint_type: 'Index expression fix',
  },
  {
    id: 'z004', type: 'debugging', label: 'Debug: Recursive Bug',
    problem: `This function should return the nth Fibonacci number.
It crashes with a RecursionError. Why? Write the missing base case condition.

\`\`\`python
def fib(n):
    if n == 1:          # Only handles one base case
        return 1
    return fib(n-1) + fib(n-2)

print(fib(6))  # Should print 8
\`\`\`

What line is missing? (write the complete missing if-statement):`,
    answer: 'if n == 0: return 0',
    hint_type: 'Missing base case',
  },
  {
    id: 'z005', type: 'debugging', label: 'Debug: Logic Error',
    problem: `This function should return the largest number in a list.
It always returns the wrong answer. Find the bug.

\`\`\`python
def find_max(lst):
    max_val = 0        # Bug is here
    for num in lst:
        if num > max_val:
            max_val = num
    return max_val

print(find_max([-5, -3, -1, -8]))  # Should print -1, but returns 0
\`\`\`

What should \`max_val\` be initialized to?`,
    answer: 'lst[0]',
    hint_type: 'Initialization fix',
  },
  {
    id: 'z006', type: 'debugging', label: 'Debug: Scope Error',
    problem: `This code should count how many times a character appears in a string.
It throws an UnboundLocalError. Fix it.

\`\`\`python
def count_char(s, ch):
    for c in s:
        if c == ch:
            count += 1    # Bug: count never initialized
    return count

print(count_char("hello world", "l"))  # Should print 3
\`\`\`

Write the line that needs to be added before the for loop:`,
    answer: 'count = 0',
    hint_type: 'Missing initialization',
  },
  {
    id: 'z007', type: 'debugging', label: 'Debug: Type Error',
    problem: `This code should print the average of a list of numbers.
It throws a TypeError. Find and fix it.

\`\`\`python
numbers = ["10", "20", "30", "40"]   # Note: strings, not ints

total = 0
for n in numbers:
    total += n          # Bug is here
    
print(total / len(numbers))
\`\`\`

Write the corrected line inside the loop:`,
    answer: 'total += int(n)',
    hint_type: 'Type conversion needed',
  },
  {
    id: 'z008', type: 'debugging', label: 'Debug: Dictionary Error',
    problem: `This code should count how many times each word appears.
It throws a KeyError. Fix the bug inside the loop.

\`\`\`python
words = ["apple", "banana", "apple", "cherry", "banana", "apple"]
count = {}

for word in words:
    count[word] += 1    # Bug: key may not exist yet
    
print(count)
# Expected: {'apple': 3, 'banana': 2, 'cherry': 1}
\`\`\`

Rewrite the 2 lines that replace \`count[word] += 1\`:`,
    answer: 'if word not in count: count[word] = 0\ncount[word] += 1',
    hint_type: 'Key existence check',
  },

  // ── OUTPUT TRACE (what does this print?) ─────────────────────
  {
    id: 'z009', type: 'output_trace', label: 'Trace: Nested Loops',
    problem: `Trace through this code carefully and write EXACTLY what it prints (one value per line).

\`\`\`python
for i in range(1, 4):
    for j in range(1, 4):
        if i == j:
            print(i * j)
\`\`\`

Write the output (numbers separated by commas):`,
    answer: '1, 4, 9',
    hint_type: 'Trace nested loops',
  },
  {
    id: 'z010', type: 'output_trace', label: 'Trace: Recursion Stack',
    problem: `Trace this recursive function. What does it print when called with \`mystery(4)\`?

\`\`\`python
def mystery(n):
    if n <= 0:
        return
    print(n)
    mystery(n - 2)
    print(n * 2)

mystery(4)
\`\`\`

Write the output values separated by commas in order:`,
    answer: '4, 2, 4, 8',
    hint_type: 'Trace recursive calls',
  },
  {
    id: 'z011', type: 'output_trace', label: 'Trace: List Operations',
    problem: `What does this code print? Trace each step.

\`\`\`python
a = [1, 2, 3, 4, 5]
b = a[1:4]
b.append(99)
a[0] = 100

print(a)
print(b)
\`\`\`

Write both outputs, one per line (write as Python lists like [1, 2, 3]):`,
    answer: '[100, 2, 3, 4, 5]\n[2, 3, 4, 99]',
    hint_type: 'List slicing + mutation',
  },
  {
    id: 'z012', type: 'output_trace', label: 'Trace: String Manipulation',
    problem: `Trace this code step by step and write the final output.

\`\`\`python
s = "DOMINATION"
result = ""
for i, ch in enumerate(s):
    if i % 2 == 0:
        result += ch.lower()
    else:
        result += ch.upper()
        
print(result)
\`\`\`

Write the exact output string:`,
    answer: 'dOmInAtIoN',
    hint_type: 'String indexing + enumerate',
  },
  {
    id: 'z013', type: 'output_trace', label: 'Trace: Lambda + Map',
    problem: `What does this print? Work through it step by step.

\`\`\`python
nums = [1, 2, 3, 4, 5]
squared = list(map(lambda x: x ** 2, nums))
filtered = list(filter(lambda x: x > 10, squared))
print(sum(filtered))
\`\`\`

Write just the number:`,
    answer: '41',
    hint_type: 'map + filter + sum',
  },

  // ── TEAM LOGIC (collaborative puzzles) ───────────────────────
  {
    id: 'z014', type: 'team_logic', label: 'Logic: Hash Table Design',
    problem: `Your team must design a simple hash function.

Given these requirements:
- Input: a student name (string)
- Output: a slot number from 0 to 9
- Method: sum the ASCII values of all characters, then take modulo 10

Calculate the slot number for: \`"Reboot"\`

ASCII values: R=82, e=101, b=98, o=111, o=111, t=116

Show your working and write the final slot number:`,
    answer: '9',
    hint_type: 'ASCII sum mod 10',
  },
  {
    id: 'z015', type: 'team_logic', label: 'Logic: Time Complexity',
    problem: `Your team gets 3 algorithms. Rank them from FASTEST to SLOWEST for n = 1,000,000.

\`\`\`
Algorithm A: Runs in O(n log n)  → ~20,000,000 operations
Algorithm B: Runs in O(n²)       → ~1,000,000,000,000 operations  
Algorithm C: Runs in O(log n)    → ~20 operations
\`\`\`

Now answer: If n doubles to 2,000,000, which algorithm's runtime increases THE MOST?
Write the letter (A, B, or C):`,
    answer: 'B',
    hint_type: 'Big-O comparison',
  },
  {
    id: 'z016', type: 'team_logic', label: 'Logic: Database Query',
    problem: `Given this table called \`students\`:

\`\`\`
| id | name    | year | score |
|----|---------|------|-------|
|  1 | Aarav   |    2 |    85 |
|  2 | Priya   |    1 |    92 |
|  3 | Rohan   |    3 |    78 |
|  4 | Sneha   |    2 |    95 |
|  5 | Karan   |    1 |    88 |
\`\`\`

Write the SQL query that returns the names of all 2nd year students with a score above 80, ordered by score descending:`,
    answers: [
      "SELECT name FROM students WHERE year = 2 AND score > 80 ORDER BY score DESC",
      "SELECT name FROM students WHERE score > 80 AND year = 2 ORDER BY score DESC",
    ],
    hint_type: 'SQL WHERE + ORDER BY',
  },
  {
    id: 'z017', type: 'team_logic', label: 'Logic: Network Packets',
    problem: `A file is 4800 bytes. It's being sent over a network where:
- Each packet can carry max 1000 bytes of data
- Each packet has a 20-byte header (overhead)
- Total packet size = header + data

Answer these 3 questions:
1. How many packets are needed to send the file?
2. What is the total bytes transmitted (including all headers)?
3. What % of total transmitted bytes is actual data? (round to 1 decimal)

Write answers as: "Q1: X | Q2: X | Q3: X%"`,
    answer: 'Q1: 5 | Q2: 5100 | Q3: 94.1%',
    hint_type: 'Network math',
  },
  {
    id: 'z018', type: 'team_logic', label: 'Logic: Binary Search Steps',
    problem: `Walk through binary search step by step.

Sorted array: \`[3, 7, 11, 15, 19, 23, 27, 31, 35, 42]\`
Target: \`23\`

At each step write: mid index, mid value, direction (go left / go right / found)

How many comparisons (steps) did it take to find 23?
Write just the number:`,
    answer: '3',
    hint_type: 'Binary search simulation',
  },
  {
    id: 'z019', type: 'team_logic', label: 'Logic: Stack Simulation',
    problem: `Simulate a stack with these operations in order:

\`\`\`
PUSH 5
PUSH 12
PUSH 8
POP
PUSH 3
PUSH 7
POP
POP
PUSH 1
\`\`\`

After all operations:
1. What is the TOP of the stack?
2. What is the full stack from bottom to top? (write as comma-separated list)

Format: "TOP: X | STACK: a, b, c"`,
    answer: 'TOP: 1 | STACK: 5, 12, 3, 1',
    hint_type: 'Stack LIFO simulation',
  },
  {
    id: 'z020', type: 'team_logic', label: 'Logic: REST API Design',
    problem: `Your team needs to design a REST API for a college library system.

For each operation below, write the correct HTTP method AND endpoint path:

1. Get a list of all books
2. Get details of the book with ID 42
3. Add a new book
4. Update only the price of book with ID 42
5. Delete book with ID 42

Format your answer as numbered lines like:
1. METHOD /path`,
    answers: [
      '1. GET /books\n2. GET /books/42\n3. POST /books\n4. PATCH /books/42\n5. DELETE /books/42',
      '1. GET /books\n2. GET /books/42\n3. POST /books\n4. PUT /books/42\n5. DELETE /books/42',
    ],
    hint_type: 'REST API conventions',
  },

  // ── CIPHER / ENCODING ────────────────────────────────────────
  {
    id: 'z021', type: 'cipher', label: 'Cipher: Multi-step Decode',
    problem: `Decode this message in 3 steps:

**Step 1:** Convert from binary to decimal for each group:
\`01000100 01001111 01001101\`

**Step 2:** Each decimal is an ASCII code. Convert to characters.

**Step 3:** Apply ROT13 to the resulting string.

Write the final decoded word (all caps):`,
    answer: 'QBZB',
    hint_type: 'Binary → ASCII → ROT13',
  },
  {
    id: 'z022', type: 'cipher', label: 'Cipher: Caesar + Reverse',
    problem: `Decode this message using 2 transformations:

Encoded message: \`OPJUANJMOD\`

**Step 1:** Reverse the entire string.
**Step 2:** Apply Caesar cipher with shift -3 (shift backwards by 3).

A=0, B=1, C=2... Shifting back means A→X, B→Y etc.

Write the decoded word:`,
    answer: 'DOMINATION',
    hint_type: 'Reverse then Caesar decode',
  },
  {
    id: 'z023', type: 'cipher', label: 'Cipher: Vigenere Light',
    problem: `Decode this Vigenère cipher.

**Encoded:** \`HMRXMREXMSR\`
**Key:** \`DOMINATION\` (repeat as needed, use only as many letters as message length)

To decode: for each letter position,
subtract the key letter's position from the encoded letter's position (mod 26).
A=0, B=1, ... Z=25.

Example: H(7) - D(3) = 4 = E

Decode all 11 letters and write the message:`,
    answer: 'ENGINEERING',
    hint_type: 'Vigenère decode',
  },

  // ── SQL LOGIC ────────────────────────────────────────────────
  {
    id: 'z024', type: 'sql_logic', label: 'SQL: Find Duplicates',
    problem: `Given this \`registrations\` table:

\`\`\`
| id | student_name | event        |
|----|-------------|--------------|
|  1 | Aarav       | Hackathon    |
|  2 | Priya       | Hackathon    |
|  3 | Aarav       | Dominance    |
|  4 | Sneha       | Hackathon    |
|  5 | Priya       | Dominance    |
|  6 | Aarav       | Hackathon    |
\`\`\`

Write a SQL query to find all student names who have registered for the SAME event MORE THAN ONCE (duplicates):`,
    answers: [
      "SELECT student_name, event FROM registrations GROUP BY student_name, event HAVING COUNT(*) > 1",
      "SELECT student_name, event FROM registrations GROUP BY event, student_name HAVING COUNT(*) > 1",
    ],
    hint_type: 'GROUP BY + HAVING',
  },
  {
    id: 'z025', type: 'sql_logic', label: 'SQL: JOIN Query',
    problem: `Two tables:

\`\`\`
teams:         members:
| id | name  | | id | team_id | name    |
|----|-------| |----|---------|---------| 
|  1 | Alpha | |  1 |       1 | Aarav   |
|  2 | Beta  | |  2 |       1 | Priya   |
|  3 | Gamma | |  3 |       2 | Rohan   |
               |  4 |       3 | Sneha   |
               |  5 |       3 | Karan   |
\`\`\`

Write a SQL query that shows: team name and how many members each team has, ordered by member count descending:`,
    answers: [
      "SELECT t.name, COUNT(m.id) AS member_count FROM teams t LEFT JOIN members m ON t.id = m.team_id GROUP BY t.id, t.name ORDER BY member_count DESC",
      "SELECT t.name, COUNT(m.id) AS member_count FROM teams t JOIN members m ON t.id = m.team_id GROUP BY t.id, t.name ORDER BY member_count DESC",
      "SELECT t.name, COUNT(m.id) AS member_count FROM teams t LEFT JOIN members m ON m.team_id = t.id GROUP BY t.id, t.name ORDER BY member_count DESC",
      "SELECT t.name, COUNT(m.id) AS member_count FROM teams t LEFT JOIN members m ON t.id = m.team_id GROUP BY t.name ORDER BY member_count DESC",
    ],
    hint_type: 'JOIN + GROUP BY + COUNT',
  },
];

// ── Gauntlet questions — 50+ 1st Year BTech DSA MCQs ─────────────
// Easy: round_max=2, Medium: round_max=4, Hard: round_max=5
export const GAUNTLET_QUESTIONS = [

  // ── ROUND 1-2: EASY — Arrays, Basic DS, Big-O intro ──────────
  { id: 'g001', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What is the index of the LAST element in an array of size N?',
    options:['N','N-1','N+1','0'], answer:'N-1' },

  { id: 'g002', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which data structure follows LIFO (Last In, First Out) order?',
    options:['Queue','Array','Stack','Linked List'], answer:'Stack' },

  { id: 'g003', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which data structure follows FIFO (First In, First Out) order?',
    options:['Stack','Queue','Tree','Graph'], answer:'Queue' },

  { id: 'g004', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What is the time complexity of accessing an element by index in an array?',
    options:['O(n)','O(log n)','O(1)','O(n²)'], answer:'O(1)' },

  { id: 'g005', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'In a singly linked list, each node contains data and a ___.',
    options:['index','pointer to next node','pointer to previous node','size'], answer:'pointer to next node' },

  { id: 'g006', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which operation adds an element to the top of a stack?',
    options:['enqueue','dequeue','push','pop'], answer:'push' },

  { id: 'g007', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What does O(1) mean in Big-O notation?',
    options:['Time grows linearly','Time is constant','Time grows quadratically','Time grows logarithmically'], answer:'Time is constant' },

  { id: 'g008', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What is the first element (index 0) of a linked list called?',
    options:['Tail','Root','Head','Leaf'], answer:'Head' },

  { id: 'g009', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which sorting algorithm works by repeatedly swapping adjacent elements that are in wrong order?',
    options:['Selection Sort','Merge Sort','Bubble Sort','Quick Sort'], answer:'Bubble Sort' },

  { id: 'g010', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What is the base case in a recursive function?',
    options:['The case that calls itself again','The condition that stops recursion','The first function call','The return type'], answer:'The condition that stops recursion' },

  { id: 'g011', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'In a binary tree, a node with no children is called a ___.',
    options:['Root','Parent','Leaf','Branch'], answer:'Leaf' },

  { id: 'g012', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What is the worst-case time complexity of Linear Search?',
    options:['O(1)','O(log n)','O(n)','O(n²)'], answer:'O(n)' },

  { id: 'g013', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'How many pointers does each node in a doubly linked list have?',
    options:['1','2','3','0'], answer:'2' },

  { id: 'g014', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which of these is NOT a valid array operation?',
    options:['Access by index','Insert at middle in O(1)','Traverse all elements','Store elements of same type'], answer:'Insert at middle in O(1)' },

  { id: 'g015', round_max:2, type:'mcq', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What does the "pop" operation do in a stack?',
    options:['Adds element to top','Removes element from top','Peeks at top without removing','Clears the stack'], answer:'Removes element from top' },

  // ── ROUND 3-4: MEDIUM — Sorting, Searching, Recursion, Trees ──
  { id: 'g016', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'What is the time complexity of Binary Search on a sorted array of n elements?',
    options:['O(n)','O(n²)','O(log n)','O(1)'], answer:'O(log n)' },

  { id: 'g017', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'Which sorting algorithm has guaranteed O(n log n) worst-case time complexity?',
    options:['Quick Sort','Bubble Sort','Merge Sort','Selection Sort'], answer:'Merge Sort' },

  { id: 'g018', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'What is a prerequisite for Binary Search to work?',
    options:['Array must be sorted','Array must have even length','Array must have no duplicates','Array size must be a power of 2'], answer:'Array must be sorted' },

  { id: 'g019', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'In Selection Sort, what happens in each pass?',
    options:['Adjacent elements are swapped','The minimum element is placed in its correct position','The list is split in half','Elements are merged'], answer:'The minimum element is placed in its correct position' },

  { id: 'g020', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'What is the height of a binary tree with only a root node?',
    options:['0','1','-1','2'], answer:'0' },

  { id: 'g021', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'What is the maximum number of nodes at level 3 of a binary tree (root = level 0)?',
    options:['4','6','8','16'], answer:'8' },

  { id: 'g022', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'Which traversal visits nodes in Left → Root → Right order?',
    options:['Pre-order','Post-order','In-order','Level-order'], answer:'In-order' },

  { id: 'g023', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'What is the space complexity of a recursive function that calls itself n times?',
    options:['O(1)','O(n)','O(log n)','O(n²)'], answer:'O(n)' },

  { id: 'g024', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'In Insertion Sort, where is a new element inserted?',
    options:['At the end','At the beginning','In its correct position in the sorted portion','At a random position'], answer:'In its correct position in the sorted portion' },

  { id: 'g025', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'Which data structure is best suited to implement a recursive function call stack?',
    options:['Queue','Stack','Array','Linked List'], answer:'Stack' },

  { id: 'g026', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'Fibonacci(5) = ? (where Fibonacci(0)=0, Fibonacci(1)=1)',
    options:['3','5','8','4'], answer:'5' },

  { id: 'g027', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'What is the worst-case time complexity of Bubble Sort?',
    options:['O(n log n)','O(n)','O(n²)','O(log n)'], answer:'O(n²)' },

  { id: 'g028', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'In a circular queue, what happens when the rear reaches the end of the array?',
    options:['Queue is full','Queue is empty','Rear wraps around to the front','A new array is allocated'], answer:'Rear wraps around to the front' },

  { id: 'g029', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'Which of the following is used to check balanced parentheses in an expression?',
    options:['Queue','Stack','Array','Tree'], answer:'Stack' },

  { id: 'g030', round_max:4, type:'mcq', difficulty:'medium', points:18, time_limit_seconds:30,
    question:'Tower of Hanoi with n disks requires how many minimum moves?',
    options:['n²','2^n','2^n - 1','n log n'], answer:'2^n - 1' },

  { id: 'g031', round_max:4, type:'text_input', difficulty:'medium', points:20, time_limit_seconds:35,
    question:'What is the output of this C code?\nint a[] = {10, 20, 30};\nprintf("%d", a[1]);',
    options:[], answer:'20' },

  { id: 'g032', round_max:4, type:'text_input', difficulty:'medium', points:20, time_limit_seconds:35,
    question:'Binary 1010 in decimal is? (Just the number)',
    options:[], answer:'10' },

  { id: 'g033', round_max:4, type:'text_input', difficulty:'medium', points:20, time_limit_seconds:35,
    question:'Decimal 13 in binary is? (Just the binary number)',
    options:[], answer:'1101' },

  { id: 'g034', round_max:4, type:'text_input', difficulty:'medium', points:20, time_limit_seconds:35,
    question:'A stack has elements [1, 2, 3] (3 on top). After 2 pops and 1 push of 5, what is on top?',
    options:[], answer:'5' },

  { id: 'g035', round_max:4, type:'text_input', difficulty:'medium', points:20, time_limit_seconds:35,
    question:'How many comparisons does binary search need in the WORST CASE for an array of 16 elements? (Just the number)',
    options:[], answer:'4' },

  // ── ROUND 5: HARD — Advanced tracing, complexity, algorithms ──
  { id: 'g036', round_max:5, type:'text_input', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'Trace Quick Sort on [5, 3, 8, 1, 9, 2] with pivot = first element (5). What are the two partitions (left and right of pivot) after the first partition step? Write as: left=[...] right=[...]',
    options:[], answer:'left=[3, 1, 2] right=[8, 9]' },

  { id: 'g037', round_max:5, type:'mcq', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'A binary tree has 7 nodes and is complete/full. What is its height? (root = level 0)',
    options:['2','3','4','1'], answer:'2' },

  { id: 'g038', round_max:5, type:'text_input', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'What is the output?\ndef fact(n):\n    if n <= 1: return 1\n    return n * fact(n-1)\nprint(fact(5))',
    options:[], answer:'120' },

  { id: 'g039', round_max:5, type:'mcq', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'Merge Sort splits an array of n=8 elements. After the FIRST split, what size are the two halves?',
    options:['2 and 6','3 and 5','4 and 4','1 and 7'], answer:'4 and 4' },

  { id: 'g040', round_max:5, type:'text_input', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'In a singly linked list of 5 nodes (1→2→3→4→5), you delete node 3. What does node 2 now point to? Write just the value.',
    options:[], answer:'4' },

  { id: 'g041', round_max:5, type:'mcq', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'Which algorithm has O(n log n) average case but O(n²) worst case?',
    options:['Merge Sort','Bubble Sort','Quick Sort','Insertion Sort'], answer:'Quick Sort' },

  { id: 'g042', round_max:5, type:'text_input', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'A complete binary tree has 15 nodes. What is its height? (root at height 0)',
    options:[], answer:'3' },

  { id: 'g043', round_max:5, type:'mcq', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'In in-order traversal of a Binary Search Tree, elements appear in what order?',
    options:['Random order','Descending order','Ascending order','Level order'], answer:'Ascending order' },

  { id: 'g044', round_max:5, type:'text_input', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'What is the postfix expression of: (A + B) * (C - D)?\nWrite in postfix (Reverse Polish Notation):',
    options:[], answer:'A B + C D - *' },

  { id: 'g045', round_max:5, type:'mcq', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'Counting sort has O(n + k) time complexity. What does k represent?',
    options:['Number of comparisons','Range of input values','Number of passes','Log of input size'], answer:'Range of input values' },

  { id: 'g046', round_max:5, type:'text_input', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'A queue uses an array of size 5. After enqueue(1), enqueue(2), enqueue(3), dequeue(), enqueue(4), what is the front element? Just the number.',
    options:[], answer:'2' },

  { id: 'g047', round_max:5, type:'mcq', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'Which traversal gives the root FIRST, then left, then right?',
    options:['In-order','Post-order','Pre-order','Level-order'], answer:'Pre-order' },

  { id: 'g048', round_max:5, type:'text_input', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'Two linked lists have n and m nodes respectively. What is the time complexity to find their intersection (starting from scratch, no hash)? Write Big-O:',
    options:[], answer:'O(n * m)' },

  { id: 'g049', round_max:5, type:'mcq', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'In a Min-Heap, the root always contains the ___ element.',
    options:['Largest','Median','Smallest','Most recently inserted'], answer:'Smallest' },

  { id: 'g050', round_max:5, type:'text_input', difficulty:'hard', points:30, time_limit_seconds:45,
    question:'Evaluate this postfix: 5 3 + 2 * 4 -\nWrite just the result number:',
    options:[], answer:'12' },
];

export function getRandomGauntletQuestion(usedIds, round, customQuestions = []) {
  // custom questions take priority
  const customPool = customQuestions.filter(q => !usedIds.includes(q.id) && (q.round_max || 5) >= round);
  const builtinPool = GAUNTLET_QUESTIONS.filter(q => !usedIds.includes(q.id) && q.round_max >= round);
  const pool = [...customPool, ...builtinPool];
  if (!pool.length) return customQuestions[0] || GAUNTLET_QUESTIONS.find(q => !usedIds.includes(q.id)) || GAUNTLET_QUESTIONS[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

// Returns 5 random zone problems (for defending team to pick from)
export function getFiveZoneOptions(usedIds) {
  const pool = ZONE_PROBLEM_POOL.filter(q => !usedIds.includes(q.id));
  const source = pool.length >= 5 ? pool : ZONE_PROBLEM_POOL; // fallback to full pool if exhausted
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5);
}

// Fisher-Yates shuffle — unbiased, O(n)
function fisherYates(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick N random questions from combined pool for quiz round
// Options within each MCQ question are also shuffled so answer order varies
// `source` selects the built-in bank: 'dsa' (gauntlet pool — original
// behaviour), 'arena' (CODE ARENA multi-topic pool), or 'both'.
// Custom questions are always included regardless of source.
export function pickQuizQuestions(n, usedIds, customQuestions = [], source = 'dsa') {
  const builtin =
    source === 'arena' ? ARENA_MCQ_POOL :
    source === 'both' ? [...GAUNTLET_QUESTIONS, ...ARENA_MCQ_POOL] :
    GAUNTLET_QUESTIONS;
  const allQ = [
    ...customQuestions.filter(q => !usedIds.includes(q.id)),
    ...builtin.filter(q => !usedIds.includes(q.id)),
  ];
  const shuffled = fisherYates(allQ);
  return shuffled.slice(0, Math.min(n, shuffled.length)).map(q => {
    // Shuffle MCQ options so the correct answer isn't always in the same position
    if (q.type === 'mcq' && Array.isArray(q.options) && q.options.length > 1) {
      return { ...q, options: fisherYates(q.options) };
    }
    return q;
  });
}

// ═════════════════════════════════════════════════════════════════
// CODE ARENA — Mission 1 "Intelligence Scan" MCQ pool
// Multi-topic bank per the Reboot Club event plan: Java, C/C++, Python,
// DBMS, OS, Git, HTML/CSS, Aptitude, Logical Reasoning.
// Pitched at 1st/2nd-year students. Equal weight (10 pts each) so the
// quiz normalises cleanly to the mission's marks.
// ═════════════════════════════════════════════════════════════════
export const ARENA_MCQ_POOL = [

  // ── JAVA ─────────────────────────────────────────────────────
  { id:'a001', type:'mcq', topic:'java', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which keyword is used to inherit a class in Java?',
    options:['implements','extends','inherits','super'], answer:'extends' },
  { id:'a002', type:'mcq', topic:'java', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What is the default value of an int instance variable in Java?',
    options:['null','undefined','0','-1'], answer:'0' },
  { id:'a003', type:'mcq', topic:'java', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which method is the entry point of a Java program?',
    options:['start()','main()','run()','init()'], answer:'main()' },
  { id:'a004', type:'mcq', topic:'java', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which of these is NOT a primitive type in Java?',
    options:['int','boolean','String','char'], answer:'String' },
  { id:'a005', type:'mcq', topic:'java', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What does JVM stand for?',
    options:['Java Virtual Machine','Java Verified Module','Just-in-time Virtual Memory','Java Variable Manager'], answer:'Java Virtual Machine' },

  // ── C ────────────────────────────────────────────────────────
  { id:'a006', type:'mcq', topic:'c', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which header file is required to use printf() in C?',
    options:['<stdlib.h>','<string.h>','<stdio.h>','<math.h>'], answer:'<stdio.h>' },
  { id:'a007', type:'mcq', topic:'c', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What is the format specifier for printing an int in C?',
    options:['%f','%c','%s','%d'], answer:'%d' },
  { id:'a008', type:'mcq', topic:'c', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which operator gives the ADDRESS of a variable in C?',
    options:['*','&','#','@'], answer:'&' },
  { id:'a009', type:'mcq', topic:'c', difficulty:'medium', points:10, time_limit_seconds:20,
    question:'What does malloc() return when memory allocation FAILS?',
    options:['0 (the integer)','an empty struct','NULL','It crashes the program'], answer:'NULL' },

  // ── C++ ──────────────────────────────────────────────────────
  { id:'a010', type:'mcq', topic:'cpp', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which of these is a feature of C++ but NOT of C?',
    options:['Pointers','Classes','Arrays','Functions'], answer:'Classes' },
  { id:'a011', type:'mcq', topic:'cpp', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'cout in C++ is defined in which header?',
    options:['<stdio.h>','<iostream>','<output.h>','<console.h>'], answer:'<iostream>' },
  { id:'a012', type:'mcq', topic:'cpp', difficulty:'medium', points:10, time_limit_seconds:20,
    question:'Which access specifier makes class members accessible ONLY inside the class itself?',
    options:['public','protected','private','internal'], answer:'private' },
  { id:'a013', type:'mcq', topic:'cpp', difficulty:'medium', points:10, time_limit_seconds:20,
    question:'What is the output of: cout << 7 / 2; in C++?',
    options:['3.5','3','4','7/2'], answer:'3' },

  // ── PYTHON ───────────────────────────────────────────────────
  { id:'a014', type:'mcq', topic:'python', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which keyword defines a function in Python?',
    options:['function','fun','def','define'], answer:'def' },
  { id:'a015', type:'mcq', topic:'python', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What does len("Hello") return in Python?',
    options:['4','5','6','Error'], answer:'5' },
  { id:'a016', type:'mcq', topic:'python', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which of these creates an empty DICTIONARY in Python?',
    options:['[]','()','{}','<>'], answer:'{}' },
  { id:'a017', type:'mcq', topic:'python', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What is the output of print(2 ** 3) in Python?',
    options:['6','8','9','23'], answer:'8' },
  { id:'a018', type:'mcq', topic:'python', difficulty:'medium', points:10, time_limit_seconds:20,
    question:'What is the output of print(type([])) in Python?',
    options:["<class 'tuple'>","<class 'dict'>","<class 'list'>","<class 'array'>"], answer:"<class 'list'>" },

  // ── DBMS ─────────────────────────────────────────────────────
  { id:'a019', type:'mcq', topic:'dbms', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What does SQL stand for?',
    options:['Standard Query Logic','Structured Query Language','Simple Question Language','System Query Layer'], answer:'Structured Query Language' },
  { id:'a020', type:'mcq', topic:'dbms', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which SQL command adds a NEW row to a table?',
    options:['ADD','APPEND','INSERT','CREATE'], answer:'INSERT' },
  { id:'a021', type:'mcq', topic:'dbms', difficulty:'medium', points:10, time_limit_seconds:20,
    question:'Which statement about a PRIMARY KEY is TRUE?',
    options:['It can contain NULL values','It must be unique and non-NULL','It can repeat across rows','Every table must have exactly two'], answer:'It must be unique and non-NULL' },
  { id:'a022', type:'mcq', topic:'dbms', difficulty:'medium', points:10, time_limit_seconds:20,
    question:'Which SQL clause filters groups AFTER GROUP BY is applied?',
    options:['WHERE','FILTER','HAVING','ORDER BY'], answer:'HAVING' },
  { id:'a023', type:'mcq', topic:'dbms', difficulty:'medium', points:10, time_limit_seconds:20,
    question:'Which command removes ALL rows from a table but keeps its structure?',
    options:['DROP TABLE','DELETE DATABASE','TRUNCATE TABLE','REMOVE ALL'], answer:'TRUNCATE TABLE' },

  // ── OPERATING SYSTEMS ────────────────────────────────────────
  { id:'a024', type:'mcq', topic:'os', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which of these is NOT an operating system?',
    options:['Linux','Windows','Oracle','macOS'], answer:'Oracle' },
  { id:'a025', type:'mcq', topic:'os', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'In CPU scheduling, what does FCFS stand for?',
    options:['First Come First Serve','Fast CPU Fast Serve','First Cache First Store','Final Come Final Serve'], answer:'First Come First Serve' },
  { id:'a026', type:'mcq', topic:'os', difficulty:'medium', points:10, time_limit_seconds:20,
    question:'A deadlock occurs when...',
    options:['the CPU overheats','processes wait for each other\'s resources in a cycle','RAM is full','a program has an infinite loop'], answer:'processes wait for each other\'s resources in a cycle' },
  { id:'a027', type:'mcq', topic:'os', difficulty:'medium', points:10, time_limit_seconds:20,
    question:'Virtual memory allows...',
    options:['programs to use more memory than physically installed RAM','the CPU to run faster','files to be deleted safely','two OSes to run at once'], answer:'programs to use more memory than physically installed RAM' },

  // ── GIT ──────────────────────────────────────────────────────
  { id:'a028', type:'mcq', topic:'git', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which command copies a remote repository to your machine?',
    options:['git copy','git clone','git download','git checkout'], answer:'git clone' },
  { id:'a029', type:'mcq', topic:'git', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which command records your staged changes into history?',
    options:['git save','git push','git commit','git stage'], answer:'git commit' },
  { id:'a030', type:'mcq', topic:'git', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which command shows which files are modified or staged?',
    options:['git list','git status','git files','git diff --all'], answer:'git status' },
  { id:'a031', type:'mcq', topic:'git', difficulty:'medium', points:10, time_limit_seconds:20,
    question:'What does git pull do?',
    options:['Uploads your commits to the remote','Deletes the local branch','Fetches remote changes and merges them into your branch','Creates a new repository'], answer:'Fetches remote changes and merges them into your branch' },

  // ── HTML / CSS ───────────────────────────────────────────────
  { id:'a032', type:'mcq', topic:'html_css', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which HTML tag creates a hyperlink?',
    options:['<link>','<a>','<href>','<url>'], answer:'<a>' },
  { id:'a033', type:'mcq', topic:'html_css', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which CSS property changes the TEXT colour of an element?',
    options:['text-style','font-color','color','text-color'], answer:'color' },
  { id:'a034', type:'mcq', topic:'html_css', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'What does CSS stand for?',
    options:['Creative Style Sheets','Cascading Style Sheets','Computer Styled Sections','Coloured Style Syntax'], answer:'Cascading Style Sheets' },
  { id:'a035', type:'mcq', topic:'html_css', difficulty:'easy', points:10, time_limit_seconds:20,
    question:'Which tag renders the LARGEST heading in HTML?',
    options:['<h6>','<head>','<h1>','<heading>'], answer:'<h1>' },

  // ── APTITUDE ─────────────────────────────────────────────────
  { id:'a036', type:'mcq', topic:'aptitude', difficulty:'easy', points:10, time_limit_seconds:25,
    question:'A train covers 120 km in 2 hours. What is its average speed?',
    options:['50 km/h','60 km/h','80 km/h','240 km/h'], answer:'60 km/h' },
  { id:'a037', type:'mcq', topic:'aptitude', difficulty:'medium', points:10, time_limit_seconds:25,
    question:'If 5 machines make 5 parts in 5 minutes, how long do 100 machines take to make 100 parts?',
    options:['100 minutes','20 minutes','5 minutes','1 minute'], answer:'5 minutes' },
  { id:'a038', type:'mcq', topic:'aptitude', difficulty:'easy', points:10, time_limit_seconds:25,
    question:'What is 15% of 200?',
    options:['15','20','30','45'], answer:'30' },

  // ── LOGICAL REASONING ────────────────────────────────────────
  { id:'a039', type:'mcq', topic:'logical', difficulty:'medium', points:10, time_limit_seconds:25,
    question:'Complete the series: 2, 6, 12, 20, 30, ?',
    options:['36','40','42','44'], answer:'42' },
  { id:'a040', type:'mcq', topic:'logical', difficulty:'easy', points:10, time_limit_seconds:25,
    question:'All Bloops are Razzies. All Razzies are Lazzies. Therefore all Bloops are definitely Lazzies.',
    options:['True','False','Cannot be determined','Only on Sundays'], answer:'True' },
  { id:'a041', type:'mcq', topic:'logical', difficulty:'easy', points:10, time_limit_seconds:25,
    question:'Find the odd one out:',
    options:['Square','Triangle','Circle','Rectangle'], answer:'Circle' },
];

// ═════════════════════════════════════════════════════════════════
// CODE ARENA — Mission 2 "Bug Hunt" program pool
// Each entry is one buggy program. Teams read the code and type the
// corrected line(s). `answers` lists every accepted phrasing — graded
// by the same lenient matcher used everywhere else (isAnswerCorrect),
// and the admin can override marks per program from the review panel.
// The event uses `bughunt_num_programs` of these (same set for every
// team — fairness first).
// ═════════════════════════════════════════════════════════════════
export const BUG_HUNT_PROGRAMS = [
  {
    id: 'b001', language: 'python', title: 'Sum to N',
    code: `def sum_to_n(n):
    total = 0
    for i in range(1, n):    # <-- something wrong here
        total += i
    return total

print(sum_to_n(5))  # Should print 15, but prints 10`,
    task: 'The function should add ALL numbers from 1 to n (inclusive). Write the corrected for-loop line.',
    answers: ['for i in range(1, n+1):', 'for i in range(1, n + 1):', 'for i in range(n+1):', 'for i in range(1,n+1):'],
    hint: 'range() stops one short of its end value.',
  },
  {
    id: 'b002', language: 'python', title: 'Find Minimum',
    code: `def find_min(nums):
    smallest = nums[0]
    for x in nums:
        if x > smallest:    # <-- something wrong here
            smallest = x
    return smallest

print(find_min([7, 2, 9, 4]))  # Should print 2, but prints 9`,
    task: 'The function should return the SMALLEST number. Write the corrected if-line.',
    answers: ['if x < smallest:', 'if smallest > x:'],
    hint: 'Look at the comparison direction.',
  },
  {
    id: 'b003', language: 'python', title: 'Class Average',
    code: `def average(marks):
    total = 0
    for m in marks:
        total += m
    return total // len(marks)    # <-- something wrong here

print(average([80, 85, 91]))  # Should print 85.33..., but prints 85`,
    task: 'The average must keep its decimal part. Write the corrected return line.',
    answers: ['return total / len(marks)'],
    hint: 'Python has two division operators — they behave differently.',
  },
  {
    id: 'b004', language: 'java', title: 'Password Check',
    code: `public class Login {
    public static void main(String[] args) {
        String password = new String("reboot123");
        String input = new String("reboot123");
        if (password == input) {    // <-- something wrong here
            System.out.println("Access granted");
        } else {
            System.out.println("Access denied");
        }
    }
}
// Should print "Access granted", but prints "Access denied"`,
    task: 'The two strings clearly match, yet access is denied. Write the corrected if-line.',
    answers: ['if (password.equals(input)) {', 'if (input.equals(password)) {', 'if (password.equals(input)){', 'if(password.equals(input)) {'],
    hint: 'In Java, == on objects compares references, not contents.',
  },
  {
    id: 'b005', language: 'java', title: 'Array Total',
    code: `public class Sum {
    public static void main(String[] args) {
        int[] nums = {10, 20, 30, 40};
        int total = 0;
        for (int i = 0; i <= nums.length; i++) {    // <-- something wrong here
            total += nums[i];
        }
        System.out.println(total);
    }
}
// Should print 100, but CRASHES with ArrayIndexOutOfBoundsException`,
    task: 'Fix the crash. Write the corrected for-loop line.',
    answers: ['for (int i = 0; i < nums.length; i++) {', 'for(int i = 0; i < nums.length; i++) {', 'for (int i = 0; i < nums.length; i++){'],
    hint: 'Valid indexes run from 0 to length − 1.',
  },
  {
    id: 'b006', language: 'java', title: 'Rocket Countdown',
    code: `public class Countdown {
    public static void main(String[] args) {
        int n = 5;
        while (n > 0) {
            System.out.println(n);
            // <-- a line is MISSING here
        }
        System.out.println("Liftoff!");
    }
}
// Should count 5..1 then print "Liftoff!", but loops forever printing 5`,
    task: 'One line is missing inside the loop. Write that missing line.',
    answers: ['n--;', 'n = n - 1;', 'n -= 1;', 'n--'],
    hint: 'What ever changes n?',
  },
  {
    id: 'b007', language: 'cpp', title: 'Secret Code',
    code: `#include <iostream>
using namespace std;
int main() {
    int code = 7;
    if (code = 10) {    // <-- something wrong here
        cout << "Locked";
    } else {
        cout << "Open";
    }
    return 0;
}
// code is 7, so it should print "Open" — but it always prints "Locked"`,
    task: 'Write the corrected if-line.',
    answers: ['if (code == 10) {', 'if(code == 10) {', 'if (code == 10){'],
    hint: 'One of these is assignment, the other is comparison.',
  },
  {
    id: 'b008', language: 'cpp', title: 'Factorial Machine',
    code: `#include <iostream>
using namespace std;
int main() {
    int n = 5;
    int fact = 0;    // <-- something wrong here
    for (int i = 1; i <= n; i++) {
        fact = fact * i;
    }
    cout << fact;
    return 0;
}
// Should print 120, but prints 0`,
    task: 'Write the corrected declaration line.',
    answers: ['int fact = 1;', 'int fact=1;'],
    hint: 'Anything multiplied by the starting value stays that value.',
  },
];

// Mission 3 problems now live in lib/codestrike.js — they carry per
// language starters, drivers and test cases for automatic grading.
// Re-exported here so existing imports keep working unchanged.
export { CODE_STRIKE_PROBLEMS } from './codestrike.js';

// ═════════════════════════════════════════════════════════════════
// CODE ARENA — Tie-breaker rapid-fire pool
// Short factual questions with typed answers, graded by the lenient
// matcher. First team to answer correctly wins the tie-break.
// ═════════════════════════════════════════════════════════════════
export const RAPID_FIRE_QUESTIONS = [
  { id:'rf01', question:'What does HTTP stand for?', answers:['HyperText Transfer Protocol', 'Hyper Text Transfer Protocol'] },
  { id:'rf02', question:'2 to the power 10 = ?', answer:'1024' },
  { id:'rf03', question:'Which data structure is LIFO?', answer:'Stack' },
  { id:'rf04', question:'Binary representation of decimal 5?', answer:'101' },
  { id:'rf05', question:'What does API stand for?', answer:'Application Programming Interface' },
  { id:'rf06', question:'Time complexity of binary search?', answers:['O(log n)', 'log n', 'O(logn)'] },
  { id:'rf07', question:'Which SQL keyword sorts the result set?', answers:['ORDER BY', 'order by'] },
  { id:'rf08', question:'Git command to upload your commits to the remote?', answers:['git push', 'push'] },
  { id:'rf09', question:'HTML tag used to display an image?', answers:['<img>', 'img'] },
  { id:'rf10', question:'Python keyword used to loop over a sequence?', answer:'for' },
  { id:'rf11', question:'What does RAM stand for?', answer:'Random Access Memory' },
  { id:'rf12', question:'Hexadecimal representation of decimal 255?', answers:['FF', '0xFF'] },
  { id:'rf13', question:'Which operator gives the remainder in C?', answers:['%', 'modulus', 'mod'] },
  { id:'rf14', question:'1 byte = how many bits?', answer:'8' },
  { id:'rf15', question:'Which company originally developed Java?', answers:['Sun Microsystems', 'Sun'] },
];
