-- PRD Online Courses: the three starter courses get their lessons and
-- quizzes. Until now every lesson was a title with nothing in it, so none
-- could be completed and no certificate could be earned.
--
-- The content lives in one function so it is written once: this migration
-- runs it for a project that already has the demo courses, and seed.sql
-- runs it after creating them on a fresh database. It only fills lessons
-- that are still empty and quizzes that have no questions, so anything
-- content staff have since written in /admin/courses is never overwritten.
--
-- Written for FindWork by its developers, to be checked by someone who
-- practises each trade before the courses are promoted. The plumbing course
-- is FindWork's own certificate, not an accreditation, and now says so.

create function private.load_course_content()
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_lesson record;
begin
  update public.courses
  set description = 'A FindWork certificate in working safely on site: around water, electricity and gas, with the right tools and the right habits. Customers see it on your profile.'
  where id = 'plumbing-safety-cert' and description like 'A recognised safety certificate%';

  for v_lesson in select * from (values
    -- ---------------------------------------------------------------- Pattern cutting
    ('pattern-cutting-basics', 1, $body$Good garments start before the scissors come out. This lesson covers the tools you need and how to take measurements you can trust.

THE TOOLS
1. A metre-long ruler and a set square, for straight lines and right angles.
2. A French curve or hip curve, for armholes, necklines and the hip line.
3. A tape measure that has not stretched. Check it against your metre ruler every few months; an old tape can be 1 to 2 cm long over a metre.
4. Pattern paper or brown paper, pencil (not pen), an eraser and paper scissors. Never cut paper with your fabric scissors: it blunts them.
5. Tailor's chalk and pins for marking fabric.

TAKING MEASUREMENTS
Measure over light clothing, with the customer standing straight and breathing normally. Tie a thin string around the natural waist first: it marks the same line for every measurement.

The core measurements for a bodice are:
- Bust: around the fullest part, tape level all round.
- Waist: around the string.
- Hip: around the fullest part of the seat, usually 18 to 22 cm below the waist.
- Shoulder: from the base of the neck to the shoulder point.
- Front and back length: from the shoulder at the neck down to the waist.
- Across front and across back: from armhole to armhole, halfway down the armhole.
- Armhole: around the arm at the shoulder joint.

Write every measurement down at once, with the customer's name, the date and the style. Read the tape twice. A measurement remembered is a measurement wrong.

EASE
A body measurement is not a garment measurement. Add ease so the person can move and breathe: about 4 to 8 cm at the bust and 2 to 4 cm at the waist for a fitted ready-to-wear dress, more for a loose style. Decide the ease before you draft, and write it beside the measurement.

PRACTICE
Measure two people this week and compare your numbers with a second measuring a day later. If any measurement differs by more than 1 cm, find out why before you cut for a paying customer.$body$),
    ('pattern-cutting-basics', 2, $body$A block is your basic pattern: a close-fitting shape with no style lines, made once from a size and then used again and again to make styles. Ready-to-wear depends on good blocks, because every piece you sell in that size comes from them.

DRAFTING THE FRONT BODICE (an outline)
1. Draw a vertical line for centre front, the front length plus 2 cm.
2. From the top, square out a line for the neck and shoulder. Mark the neck width (about one sixth of the neck measurement) and drop the front neck by about the same amount plus 1 cm. Join with a smooth curve.
3. Mark the shoulder length from the neck point, dropping the shoulder about 4 to 5 cm so it slopes.
4. Square out the bust line at armhole depth, and mark a quarter of the bust plus half your ease.
5. Mark the waist line at front length, and a quarter of the waist plus ease, plus the width of the waist dart.
6. Draw the armhole with your curve from shoulder point through the across-front mark to the bust line.
7. Place the bust point (apex) and draw the waist dart from it down to the waist.

The back is drafted the same way from the back measurements, with a higher neck and usually a shoulder dart or ease instead of a bust dart.

CHECK BEFORE YOU TRUST IT
- Walk the side seams: front and back side seams must be the same length.
- Walk the shoulder seams: the back can be up to 1 cm longer if you will ease it in.
- Lay front and back together at the shoulder and check the neckline and armhole curves flow without points.
- Every dart must close into a smooth line when folded.

TEST IT IN CALICO
Cut the block in cheap cotton or calico, sew it with long stitches and fit it on the person or a dress form of that size. Mark changes on the calico, then copy them back to the paper. A block is finished when the calico fits without pulling or gaping. Only then cut it in card and label it with the size, date and seam allowance (or "no seam allowance").$body$),
    ('pattern-cutting-basics', 3, $body$Fabric is usually the biggest cost in a garment. Cutting well saves money on every piece, and in ready-to-wear the saving is multiplied by every piece you make.

BEFORE YOU CUT
1. Pre-shrink fabric that shrinks. Cotton, Ankara and many local prints can shrink 3 to 5 per cent. Wash or steam a test piece and measure it before and after.
2. Find the grain. The lengthwise grain runs parallel to the selvedge (the woven edge). Every pattern piece has a grain line; it must sit parallel to the selvedge, measured at both ends with your ruler.
3. Check the print. For prints with a direction (people, writing, animals), every piece must face the same way. Large motifs should be placed deliberately: not a big circle on the bust point.

PLANNING THE LAY
- Lay out all the pieces before you cut any. Largest pieces first, then fit small pieces (facings, pockets, collars) into the gaps.
- Fold fabric only when the pieces are symmetrical and the print allows it.
- For several sizes in one lay (common in ready-to-wear), nest the sizes so small pieces fill the spaces left by large ones.
- Measure the length of fabric the lay uses. Write it on the pattern envelope: next time you will know exactly how much to buy.

CUTTING
- Pin or weight the pattern flat. Paper that lifts gives a wrong shape.
- Cut with long, smooth strokes of sharp shears, keeping the lower blade on the table.
- Mark notches, darts and grain with small snips or chalk, never long cuts into the seam allowance.
- Cut every piece needed before you start sewing, and bundle them with a label: style, size, customer or batch.

USING WHAT IS LEFT
Keep useful offcuts sorted by fabric. They become facings, pockets, bias binding, children's pieces or headwraps that can be sold. A waste bag full of large pieces is money thrown away.

PRACTICE
Plan one style in two layouts and compare how much fabric each needs. The difference is your saving per garment.$body$),
    ('pattern-cutting-basics', 4, $body$A customer judges a garment in the first minute: how it hangs, how the seams lie, what it feels like inside. Finishing and checking are what turn good cutting into something people pay for and come back for.

FINISHING SEAMS
- Overlock (serge) or zigzag every raw edge that will be washed. Unfinished edges fray in the first wash.
- Press each seam as you sew it, before it is crossed by another seam. Press, do not iron: lift and place the iron rather than pushing it, so the fabric does not stretch.
- Use a pressing cloth on dark fabrics, sequins and lace to avoid shine and melting.
- Clip curves (necklines, armholes) so they lie flat, and grade bulky seams by trimming each layer to a different width.

HEMS AND OPENINGS
- Let bias-cut and stretchy garments hang for a day before hemming; the hem drops.
- Measure the hem from the floor on a dress form or the person, not from the waist seam.
- Zips should lie flat with no ripples, the teeth hidden if it is a concealed zip.

THE QUALITY CHECK
Check every piece before it leaves you, under good light, with a list:
1. Measurements: bust, waist, hip and length within 1 cm of the size chart.
2. Seams straight, even and secure. Pull gently at stress points: armholes, crotch, zip ends.
3. No loose threads, chalk marks or pins.
4. Fastenings work: zips run smoothly, buttons match their holes, hooks hold.
5. Symmetry: both sleeves the same length, pockets level, darts the same on both sides.
6. Print and colour match across seams where they should.
7. Label and care instructions attached.

Anything that fails goes back for fixing, not out to the customer.

AFTER THE SALE
Note any complaint or alteration against the style and size. If the same fix keeps coming up, the block or the pattern needs changing, not every garment. Good ready-to-wear businesses improve their patterns from what customers tell them.$body$),
    -- ---------------------------------------------------------------- Bookkeeping
    ('small-business-bookkeeping', 1, $body$The most common reason small businesses fail to grow is not low sales. It is not knowing how much the business actually makes, because business money and personal money are mixed together.

WHY SEPARATE
When school fees, food, transport home and a family emergency all come out of the same purse as fabric, stock and shop rent, you cannot tell whether the business is making a profit. You may think it is doing well when it is slowly eating its own stock money, or think it is failing when it is doing fine.

HOW TO SEPARATE
1. Open a separate account for the business. A second bank account, a business wallet or a FindWork wallet used only for business all work. Every business payment goes in and out of it.
2. Pay yourself a salary. Decide a fixed amount you take from the business each week or month, and move it to your personal account on the same day each time. Spend from your personal account, not from the business.
3. Keep a petty cash tin for small business cash, with a notebook inside. Every time money goes in or out, write the date, amount and reason.
4. Keep receipts. Photograph receipts on your phone in a folder named for the month, or keep them in an envelope.

WHAT IF THE BUSINESS IS SHORT?
If you must put personal money into the business, write it down as "owner put in". If you take extra out, write it as "owner took out". These are not sales or costs; they are money moving between you and the business. Writing them down keeps the picture true.

HOW MUCH TO PAY YOURSELF
Start with what the business can afford after paying for stock, rent and other costs in a normal month. It is better to pay yourself a small, steady amount and keep the business healthy than to take whatever is left and have nothing for next week's stock.

THIS WEEK
Choose your business account, decide your weekly salary, and start the cash notebook. Next lesson: recording every sale.$body$),
    ('small-business-bookkeeping', 2, $body$A sales record tells you what sells, when, and for how much. Ten minutes at the end of each day is enough, as long as you do it every day.

WHAT TO RECORD FOR EACH SALE
- Date
- What was sold (item or service)
- Quantity
- Price received (after any discount)
- How it was paid: cash, transfer, card or FindWork wallet

A simple daily page looks like this:

Date: 14 March
Ankara dress, 1, ₦18,000, transfer
Alteration, 2, ₦3,000, cash
Headwrap, 3, ₦4,500, cash
Total: ₦25,500 (cash ₦7,500, transfer ₦18,000)

AT CLOSING TIME
1. Add up the day's sales.
2. Count the cash in the tin and check your transfer alerts or wallet history.
3. Cash counted should equal opening cash plus cash sales minus cash spent. If it does not, find out why today, while you can still remember.

COSTS, TOO
On the same page or the next, record what you spent that day for the business: stock, transport for stock, data, electricity or fuel for the generator, packaging. Write what it was for. These are your costs, and you will need them in the next lesson.

WEEKLY AND MONTHLY
At the end of each week, add up sales and costs. At the end of the month, add up the weeks. Patterns appear quickly: the busy days, the slow months, the items that sell and the ones that sit.

TOOLS
A notebook works. So does a spreadsheet or a free bookkeeping app. FindWork's wallet history also shows every sale paid through FindWork, with dates and amounts, which you can export from your transactions. Use whichever you will actually keep up every day.

THIS WEEK
Record every sale and every cost for seven days, and check your cash every night.$body$),
    ('small-business-bookkeeping', 3, $body$Profit is what the business keeps after paying for everything it used to make its sales. A profit and loss statement (P&L) for the month shows it in a few lines.

THE SHAPE OF A P&L
Sales (all money received for goods and services this month)
minus Cost of goods sold (the stock or materials used for what you sold)
= Gross profit
minus Running costs (rent, transport, data, electricity and fuel, staff, phone, marketing, platform fees)
= Net profit

AN EXAMPLE
Sales: ₦420,000
Cost of goods sold (fabric, thread, zips used): ₦160,000
Gross profit: ₦260,000
Running costs: rent ₦40,000, generator fuel ₦35,000, transport ₦20,000, data ₦8,000, FindWork fees ₦12,000, apprentice ₦30,000. Total ₦145,000.
Net profit: ₦115,000

Your own salary (from lesson 1) is paid out of net profit. If net profit is smaller than your salary, the business is shrinking.

WHAT THE NUMBERS TELL YOU
- Gross margin = gross profit ÷ sales. Here, 260,000 ÷ 420,000 = 62 per cent. If your margin falls month after month, your materials are costing more or your prices are too low.
- Which running costs grew? Fuel and transport often creep up unnoticed.
- Compare months. One bad month is normal; three in a row is a signal to act.

PRICING FROM YOUR P&L
Work out your running costs per month and how many pieces or jobs you do. Running costs ÷ jobs is the overhead each job must cover, on top of its materials. Price below that and every sale loses money, however busy you are.

STOCK
Count your stock at the end of each month. Stock you bought but have not used is not a cost yet; it is still money in the business, sitting on a shelf.

THIS MONTH
Using your sales and cost records, write your first P&L. Then answer three questions: Did I make a profit? What was my biggest cost? What one change would improve next month?$body$),
    -- ---------------------------------------------------------------- Plumbing safety
    ('plumbing-safety-cert', 1, $body$Most injuries on plumbing jobs come from a few causes: water and electricity together, falls, cuts, lifting, and working in a hurry. Good habits prevent nearly all of them, and customers notice a professional who works safely.

BEFORE YOU START
1. Walk the job with the customer. Ask where the water stopcock, the main electrical switch and any gas cylinder are.
2. Turn off the water supply to the area you are working on, and open a tap to release pressure. Check it is off by opening the tap again after a minute.
3. If you will work near sockets, wiring, a water heater or a pumping machine, switch off the power at the switch or breaker and keep the key or tell the household not to switch it back on.
4. Clear the work area and lay down a sheet. Wet tiles are slippery.

ELECTRICITY AND WATER
- Never touch electrical fittings with wet hands, and never stand in water near live wiring.
- Water heaters, borehole pumps and booster pumps are electrical. Isolate them before working on their pipework.
- If you find damaged wiring, stop and tell the customer it needs an electrician. Do not repair wiring unless you are qualified.

TOOLS AND PROTECTIVE EQUIPMENT
- Gloves when cutting or handling pipe and when using solvent cement.
- Safety glasses when cutting, drilling, or working overhead.
- Knee pads for long jobs on hard floors.
- Keep blades sharp. A blunt hacksaw or pipe cutter slips and cuts hands.
- Solvent cement and primer give off fumes: open windows and keep away from flames.

HEIGHTS
Overhead tanks and high pipework mean ladders. Check the ladder is sound, on firm level ground, at the right angle (one unit out for every four up) and held by a second person for anything above head height. Never stand on the top two steps, and never lean out sideways to reach.

LIFTING
Bend your knees, keep your back straight, and hold loads close. Ask for help with tanks, toilets and heavy fittings.

WHEN YOU FINISH
Restore water slowly and check every joint for leaks. Restore power only when the area is dry. Clean up, and tell the customer what you did and anything you noticed that needs attention.$body$),
    ('plumbing-safety-cert', 2, $body$Water lines are your trade. Gas lines need extra care, and some gas work is for gas specialists only. This lesson covers both, and where your work should stop.

WATER LINES
Pressure: mains and pumped systems are under pressure. Isolate and drain before you cut. A pipe cut under pressure sprays water across sockets and switches.

Materials:
- PVC and PPR pipes are joined by solvent cement and by heat fusion respectively. Use the right fittings for the right pipe; mixing systems causes leaks.
- Solvent cement needs time to set before the system is filled: follow the time on the tin.
- Heat fusion tools are hot enough to burn badly. Use the stand, and let the joint cool undisturbed.
- Galvanised steel in older buildings rusts inside. Expect weak joints when you work near it.

Hot water: storage water heaters can scald. Switch off and let water cool, or drain carefully, before working on hot lines. Every heater must have a working pressure relief valve; if it is missing or blocked, tell the customer it must be fixed before the heater is used again.

Testing: after any job, fill slowly, bleed air from the highest tap, and check every joint you touched, dry, after ten minutes and again before you leave.

GAS (LPG CYLINDERS AND PIPED GAS)
Many kitchens have an LPG cylinder with a regulator and hose; some buildings have piped gas.

If you smell gas:
1. Do not switch any electrical switch on or off, and do not use a lighter or match.
2. Close the cylinder valve if it is safe to reach.
3. Open doors and windows.
4. Get everyone out, and call the gas supplier or an emergency service from outside.

Your limits: changing a damaged hose for an approved one, or moving pipework near gas lines, needs care. Altering gas pipework, regulators or appliance connections should be done only by someone trained and certified for gas. If a job needs gas work you are not certified for, say so and recommend a gas specialist. That is the professional answer, and customers respect it.

Checking a gas connection for leaks: brush soapy water over the joint. Bubbles mean a leak. Never use a flame to find a leak.

Working near gas: keep cylinders upright and away from heat, keep hot tools and sparks away from hoses, and never run a pipe so that it presses on a gas hose.$body$),
    ('plumbing-safety-cert', 3, $body$This course ends with a short quiz on the two lessons before. Pass it, at 70 per cent or more, and you receive a FindWork certificate in plumbing site safety. It appears on your profile and can be checked by anyone with its code.

WHAT THE CERTIFICATE MEANS
It shows customers that you have learned FindWork's safety standards for plumbing work: isolating water and electricity, working at height, handling materials, and knowing when gas work is for a specialist. It is a FindWork certificate, not a government licence or trade accreditation. Where a job legally needs a licensed or certified person, the certificate does not replace that.

BEFORE YOU TAKE THE QUIZ
Go back over:
- What to turn off before starting, and how to check it is off.
- Why water and electricity must be kept apart, and what to do about damaged wiring.
- Ladder safety: the angle, firm ground, the top steps.
- Pressure, solvent cement and heat fusion on water lines.
- Water heaters and the pressure relief valve.
- What to do if you smell gas, and what not to do.
- Which gas work you should hand to a gas specialist.

HOW THE QUIZ WORKS
There are eight questions. Choose one answer for each, then send. You see your score straight away. If you do not pass, review the lessons and try again; you have three attempts a day.

KEEP LEARNING
Safety is a habit, not a test. The best plumbers walk every job before they start, tell customers what they are doing, and stop when something is outside their skill. That is what keeps you safe, and what earns repeat customers and good reviews.$body$)
  ) as content(course_id, position, body)
  loop
    update public.course_lessons set body = v_lesson.body
    where course_id = v_lesson.course_id and position = v_lesson.position and coalesce(trim(body), '') = '';
  end loop;

  -- Quizzes, only where a course has none yet. correct_index counts from 0.
  if exists(select 1 from public.courses where id = 'pattern-cutting-basics')
     and not exists(select 1 from public.quiz_questions where course_id = 'pattern-cutting-basics') then
    insert into public.quiz_questions(course_id, position, prompt, options, correct_index) values
      ('pattern-cutting-basics', 1, 'Why should you check your tape measure against a metre ruler?', array['Old tapes stretch and give long measurements', 'Rulers are more colourful', 'Customers prefer rulers', 'It is not necessary'], 0),
      ('pattern-cutting-basics', 2, 'What is ease?', array['Extra room added to body measurements so the wearer can move', 'A type of fabric', 'The seam allowance', 'A discount for regular customers'], 0),
      ('pattern-cutting-basics', 3, 'What is a block?', array['A finished dress', 'A basic close-fitting pattern used to make styles', 'A pile of fabric', 'A measuring tool'], 1),
      ('pattern-cutting-basics', 4, 'Before cutting the block in good fabric, you should:', array['Sell it straight away', 'Test it in calico and correct the fit', 'Add more darts', 'Make it larger'], 1),
      ('pattern-cutting-basics', 5, 'The grain line on a pattern piece must lie:', array['Across the fabric', 'At an angle to the selvedge', 'Parallel to the selvedge', 'Anywhere that saves fabric'], 2),
      ('pattern-cutting-basics', 6, 'Why pre-shrink cotton and Ankara before cutting?', array['To change the colour', 'Because they can shrink 3 to 5 per cent in the first wash', 'To make them stiffer', 'It makes cutting faster'], 1),
      ('pattern-cutting-basics', 7, 'When should you let a garment hang before hemming?', array['Never', 'When it is cut on the bias or stretchy, because the hem drops', 'Only for trousers', 'Only when it is raining'], 1),
      ('pattern-cutting-basics', 8, 'If the same alteration keeps coming back from customers, you should:', array['Fix every garment one by one forever', 'Change the block or pattern', 'Stop selling that size', 'Ignore it'], 1);
  end if;

  if exists(select 1 from public.courses where id = 'small-business-bookkeeping')
     and not exists(select 1 from public.quiz_questions where course_id = 'small-business-bookkeeping') then
    insert into public.quiz_questions(course_id, position, prompt, options, correct_index) values
      ('small-business-bookkeeping', 1, 'Why keep business money separate from personal money?', array['So you can tell whether the business makes a profit', 'Banks require it', 'It hides money from family', 'It is not important'], 0),
      ('small-business-bookkeeping', 2, 'The best way to pay yourself from the business is:', array['Take whatever is left each day', 'A fixed salary on a set day', 'Only when sales are high', 'Never pay yourself'], 1),
      ('small-business-bookkeeping', 3, 'Money you put into the business from your own pocket should be recorded as:', array['A sale', 'A cost', 'Owner put in', 'Nothing'], 2),
      ('small-business-bookkeeping', 4, 'At closing, cash in the tin should equal:', array['Total sales for the day', 'Opening cash plus cash sales minus cash spent', 'Yesterday''s cash', 'Transfers received'], 1),
      ('small-business-bookkeeping', 5, 'Sales of ₦300,000 with cost of goods sold of ₦120,000 give a gross profit of:', array['₦420,000', '₦120,000', '₦180,000', '₦300,000'], 2),
      ('small-business-bookkeeping', 6, 'Which of these is a running cost?', array['Generator fuel', 'Money the owner put in', 'A sale paid by transfer', 'Stock still on the shelf'], 0),
      ('small-business-bookkeeping', 7, 'Stock you bought but have not yet used is:', array['A loss', 'Still money in the business, not yet a cost', 'Profit', 'A running cost'], 1),
      ('small-business-bookkeeping', 8, 'If your price does not cover materials plus each job''s share of running costs:', array['You make more profit when busy', 'Every sale loses money', 'It does not matter', 'Your margin rises'], 1);
  end if;

  if exists(select 1 from public.courses where id = 'plumbing-safety-cert')
     and not exists(select 1 from public.quiz_questions where course_id = 'plumbing-safety-cert') then
    insert into public.quiz_questions(course_id, position, prompt, options, correct_index) values
      ('plumbing-safety-cert', 1, 'Before cutting a water pipe you should:', array['Cut quickly before the customer notices', 'Turn off the supply and open a tap to release pressure', 'Turn the pump on', 'Wet the area first'], 1),
      ('plumbing-safety-cert', 2, 'You find damaged wiring near the pipe you are fixing. You should:', array['Tape it and carry on', 'Stop and tell the customer it needs an electrician', 'Pour water on it', 'Cut it off'], 1),
      ('plumbing-safety-cert', 3, 'A ladder is set at the right angle when it is:', array['One unit out for every four up', 'Straight up against the wall', 'Flat on the ground', 'As far out as possible'], 0),
      ('plumbing-safety-cert', 4, 'Before filling a system after using solvent cement, you should:', array['Fill it immediately', 'Wait the setting time on the tin', 'Heat the joint with a flame', 'Add more cement while it runs'], 1),
      ('plumbing-safety-cert', 5, 'A storage water heater''s pressure relief valve is missing. You should:', array['Ignore it', 'Tell the customer it must be fixed before the heater is used', 'Block the opening', 'Turn the thermostat up'], 1),
      ('plumbing-safety-cert', 6, 'You smell gas in a kitchen. Which of these should you NOT do?', array['Open windows and doors', 'Close the cylinder valve if safe', 'Switch on the light to see better', 'Get everyone outside'], 2),
      ('plumbing-safety-cert', 7, 'The safe way to check a gas joint for a leak is:', array['Hold a lighter near it', 'Brush soapy water on it and look for bubbles', 'Smell it closely for a long time', 'Turn the gas up high'], 1),
      ('plumbing-safety-cert', 8, 'A job needs a gas regulator moved and you are not certified for gas. You should:', array['Do it anyway', 'Recommend a certified gas specialist', 'Remove the regulator', 'Tell the customer gas is not dangerous'], 1);
  end if;
end;
$fn$;
revoke all on function private.load_course_content() from public, anon, authenticated;

select private.load_course_content();
